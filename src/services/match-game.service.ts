import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { GameStatus, MatchStage, MatchStatus, TournamentStatus } from '@prisma/client';
import { UserPayload } from 'src/auth/jwt.strategy';
import { CreateMatchGameDto } from 'src/controllers/dto/create-match-game-dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { generateSwissPairings } from 'src/utils/tournament-helpers.ts';

@Injectable()
export class MatchGameService {
  constructor(private prisma: PrismaService) {}

  async createGame(dto: CreateMatchGameDto, user: UserPayload) {
    // verifica se o match existe
    const match = await this.prisma.match.findUnique({
      where: { id: dto.matchId },
      select: { aId: true, bId: true, games: true, status: true },
    });

    if (!match) throw new BadRequestException('Partida não encontrada');

    if(match.status === 'FINISHED') throw new BadRequestException('Partida finalizada');

    if (match.games.filter(gm => gm.status === 'IN_PROGRESS').length > 0) {
      throw new BadRequestException('Partida em andamento')
    }

    // impede criação se houver jogos não finalizados (não DONE)
    const unfinishedGames = match.games.filter(
      gm => gm.status !== GameStatus.DONE && gm.status !== GameStatus.CONFIRMED
    );
    if (unfinishedGames.length > 0) {
      throw new BadRequestException('Ainda há jogos pendentes ou aguardando confirmação.');
    }

    // conta quantos jogos já existem para definir o próximo index
    const existingGames = await this.prisma.matchGame.count({
      where: { matchId: dto.matchId },
    });

    const nextIndex = existingGames + 1;

    // o host é definido manualmente pelo primeiro jogador que clicar
    if (![match.aId, match.bId].includes(user.sub)) {
      throw new BadRequestException('Host inválido para esta partida');
    }

    if (match.status === 'SCHEDULED') {
      await this.prisma.match.update({
        where: {
          id: dto.matchId
        },
        data: {
          status: MatchStatus.DISPUTED
        }
      })
    }

    // cria o novo jogo (sem limite de 3, pode prolongar em caso de empates)
    const game = await this.prisma.matchGame.create({
      data: {
        matchId: dto.matchId,
        index: nextIndex,
        hostUserId: user.sub,
        code: dto.code,
        status: GameStatus.PENDING,
      },
      include: {
        match: { select: { aId: true, bId: true } },
      },
    });

    return { message: 'Batalha criada com sucesso', game };
  }

  async getGamesByMatch(matchId: string) {
    return this.prisma.matchGame.findMany({
      where: { matchId },
      orderBy: { index: 'asc' },
      include: {
        winnerUser: {
          select: {name: true}
        }
      }
    });
  }

  async acceptGame(id: string, user: UserPayload) {
    await this.prisma.auditLog.create({
      data: {
        action: `Game accepted`,
        userId: user.sub,
        entity: 'MatchGame',
        entityId: id,
      },
    });

    const matchGame = await this.prisma.matchGame.findUnique({
      where: {
        id
      }
    })

    if(!matchGame) throw new BadRequestException('Match Game not found')

    if(matchGame.hostUserId === user.sub) throw new BadRequestException('Somente o usuário contrario deve aceitar')

    const updatedGame = await this.prisma.matchGame.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });

    return {
      message: `Game accepted to user`,
      updatedGame,
    };
  }

  async updateGameStatus(id: string, status: GameStatus, user: UserPayload) {
    await this.prisma.auditLog.create({
      data: {
        action: `Game status updated to ${status}`,
        userId: user.sub,
        entity: 'MatchGame',
        entityId: id,
      },
    });

    const matchGame = await this.prisma.matchGame.findUnique({
      where: {
        id
      }
    })

    if(!matchGame) throw new BadRequestException('Match Game not found')

    if(matchGame.status === status) throw new BadRequestException('Status inválido')

    const updatedGame = await this.prisma.matchGame.update({
      where: { id },
      data: { status },
    });

    return {
      message: `Game status updated to ${status}`,
      updatedGame,
    };
  }

  async reportGameResult(id: string, winnerUserId: string, user: UserPayload) {
    const game = await this.prisma.matchGame.findUnique({ where: { id } });
    if (!game) throw new BadRequestException('Match Game não encontrado');

    // Só o host pode reportar
    if (game.hostUserId !== user.sub) {
      throw new ForbiddenException('Apenas o host pode reportar o resultado');
    }

    if(game.status !== 'IN_PROGRESS') {
      throw new BadRequestException('O jogo não está em andamento.')
    }

    const updated = await this.prisma.matchGame.update({
      where: { id },
      data: {
        winnerUserId,
        status: GameStatus.WAITING_CONFIRMATION,
        reportedAt: new Date(),
      },
    });

    // Cria log
    await this.prisma.auditLog.create({
      data: {
        action: `Resultado reportado: ${winnerUserId}`,
        userId: user.sub,
        entity: 'MatchGame',
        entityId: id,
      },
    });

    return { message: 'Resultado aguardando confirmação', updated };
  }

  async checkIfMatchFinished(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        aId: true,
        bId: true,
        stage: true,
        scoreA: true,
        scoreB: true,
        tournamentId: true,
      },
    });

    if (!match) throw new BadRequestException('Partida não encontrada');

    const aWins = Number(match.scoreA || 0);
    const bWins = Number(match.scoreB || 0);

    // Validação de fim de MD3
    if (aWins >= 2 || bWins >= 2) {
      const winnerId = aWins > bWins ? match.aId : match.bId;
      const loserId = aWins < bWins ? match.aId : match.bId;

      // Atualiza a Match
      await this.prisma.match.update({
        where: { id: matchId },
        data: {
          status: 'FINISHED',
          winnerId,
        },
      });

      // Atualiza Standing (ranking)
      await this.prisma.standing.update({
        where: {
          userId_tournamentId: {
            userId: winnerId,
            tournamentId: match.tournamentId,
          },
        },
        data: {
          points: { increment: 2 },
          wins: { increment: 1 },
        },
      });

      await this.prisma.standing.update({
        where: {
          userId_tournamentId: {
            userId: loserId,
            tournamentId: match.tournamentId,
          },
        },
        data: {
          points: { increment: 1 },
          losses: { increment: 1 },
        },
      });
      await this.handleNextRound(match.tournamentId)
      
      if (match.stage) {
        if (["QUARTER_FINAL", "SEMI_FINAL"].includes(match.stage)) {
          await this.advanceKnockoutStage(match.tournamentId, match.stage as "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL");
        } else if (match.stage === "FINAL") {
          console.log("🏁 Final concluída — encerrando torneio...");
          await this.finishTournament(match.tournamentId);
        }
      }

      return { finished: true, winnerId };
    }


    return { finished: false };
  }

  async confirmGameResult(id: string, user: UserPayload) {
    const game = await this.prisma.matchGame.findUnique({
      where: { id },
      include: { match: true },
    });

    if (!game) throw new BadRequestException('Match Game não encontrado');
    if (game.status !== GameStatus.WAITING_CONFIRMATION)
      throw new BadRequestException('O jogo ainda não foi reportado');

    // o jogador que confirma precisa ser o oponente do host
    const { aId, bId } = game.match;
    const opponent = aId === game.hostUserId ? bId : aId;
    if (user.sub !== opponent)
      throw new ForbiddenException('Apenas o adversário pode confirmar o resultado');

    const incrementScore = (oldScore?: number | null): number => Math.min((oldScore ?? 0) + 1, 2);

    let newScoreA = game.match.scoreA ?? 0;
    let newScoreB = game.match.scoreB ?? 0;

    // Increment score for the actual game winner, not the confirmer
    if (game.winnerUserId === game.match.aId) {
      newScoreA = incrementScore(newScoreA);
    } else if (game.winnerUserId === game.match.bId) {
      newScoreB = incrementScore(newScoreB);
    }

    const updatedMatch = await this.prisma.match.update({
      where: { id: game.match.id },
      data: { scoreA: newScoreA, scoreB: newScoreB },
    });

    const aWins = Number(updatedMatch.scoreA || 0);
    const bWins = Number(updatedMatch.scoreB || 0);

    if (aWins >= 2 || bWins >= 2) {
      await this.checkIfMatchFinished(updatedMatch.id);
    }

    const updated = await this.prisma.matchGame.update({
      where: { id },
      data: {
        status: GameStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
    });

    // Cria log de confirmação
    await this.prisma.auditLog.create({
      data: {
        action: `Resultado confirmado por ${user.sub}`,
        userId: user.sub,
        entity: 'MatchGame',
        entityId: id,
      },
    });

    return { message: 'Resultado confirmado com sucesso', updated };
  }

  async handleNextRound(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { currentRound: true, totalRounds: true, status: true },
    });

    if (!tournament) return;

    if (['KNOCKOUT', 'FINISHED'].includes(tournament.status as string)) {
      console.log(`⛔ Torneio ${tournamentId} já está no mata-mata ou finalizado — handleNextRound ignorado.`);
      return;
    }

    const currentRound = tournament.currentRound;

    const allMatches = await this.prisma.match.findMany({
      where: { tournamentId, round: currentRound },
    });

    const allFinished = allMatches.every(m => m.status === "FINISHED");
    if (!allFinished) {
      console.log("Ainda há partidas em andamento.");
      return;
    }

    // Se terminou a fase suíça → inicia mata-mata (Top 8)
    if (tournament.totalRounds && currentRound >= tournament.totalRounds) {
      const res = await this.startKnockoutStage(tournamentId);
      console.log('Knockout:', res?.message ?? 'iniciado');
      return;
    }

    const standings = await this.prisma.standing.findMany({
      where: { tournamentId },
      orderBy: [{ points: "desc" }, { wins: "desc" }],
    });

    if (!standings.length) {
      console.log("⚠️ Nenhum jogador encontrado para gerar nova rodada.");
      return;
    }

    const newPairings = generateSwissPairings(standings, 1);
    console.log(newPairings)

    for (const match of newPairings[0]) {
      if (match.bye) {
        console.log(`🟡 ${match.player} recebe BYE`);
        continue;
      }


      await this.prisma.match.create({
        data: {
          tournamentId,
          round: currentRound + 1,
          aId: match.playerA,
          bId: match.playerB,
          status: "SCHEDULED",
        },
      });
    }

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: { increment: 1 } },
    });

    console.log(`✅ Nova rodada ${currentRound + 1} criada com sucesso.`);
  }

  async startKnockoutStage(tournamentId: string) {
    // evita duplicar caso já tenha começado o KO
    const alreadyStarted = await this.prisma.match.count({
      where: { tournamentId, stage: MatchStage.QUARTER_FINAL },
    });
    if (alreadyStarted > 0) {
      return { message: 'Knockout já iniciado (quartas existentes).' };
    }

    // pega os 8 melhores (ajuste os desempates conforme sua regra)
    const top8 = await this.prisma.standing.findMany({
      where: { tournamentId },
      orderBy: [
        { points: 'desc' },
        { wins: 'desc' },
      ],
      take: 8,
    });

    if (top8.length < 2) {
      throw new BadRequestException('Jogadores insuficientes para iniciar o mata-mata.');
    }

    // Geração dinâmica dos pares para qualquer quantidade de jogadores >= 2
    // Ordena pelo ranking e faz o emparelhamento do topo com o fundo
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < Math.floor(top8.length / 2); i++) {
      const a = top8[i]?.userId;
      const b = top8[top8.length - 1 - i]?.userId;
      if (a && b && a !== b) {
        pairs.push([a, b]);
      }
    }

    if (pairs.length === 0) {
      throw new BadRequestException('Não foi possível formar confrontos para o mata-mata.');
    }

    // Ajusta dinamicamente a fase do mata-mata conforme o número de jogadores
    let knockoutStage: MatchStage = MatchStage.QUARTER_FINAL;
    if (top8.length <= 4) {
      knockoutStage = MatchStage.SEMI_FINAL;
    }
    if (top8.length <= 2) {
      knockoutStage = MatchStage.FINAL;
    }

    await this.prisma.match.createMany({
      data: pairs.map(([aId, bId]) => ({
        tournamentId,
        aId,
        bId,
        round: 1,
        stage: knockoutStage,
        status: MatchStatus.SCHEDULED,
      })),
    });

    // Atualiza status do torneio e ajusta currentRound conforme a fase
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.KNOCKOUT,
        currentRound: 1,
      },
    });

    return { message: `Mata-mata iniciado (${knockoutStage}) com ${pairs.length} partidas.`, matches: pairs.length };
  }

  async advanceKnockoutStage(tournamentId: string, currentStage: "QUARTER_FINAL" | "SEMI_FINAL" | "FINAL") {
    // 🧱 trava adicional para evitar duplicação da final
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true },
    });

    if (!tournament) return;

    if (tournament.status === TournamentStatus.FINISHED) {
      console.log("🏁 Torneio já finalizado — ignorando avanço de fase.");
      return;
    }

    // 🧱 trava completa: bloqueia se já houver qualquer final existente (independente do status)
    const existingFinal = await this.prisma.match.count({
      where: {
        tournamentId,
        stage: MatchStage.FINAL,
      },
    });

    if (existingFinal > 0) {
      console.log("🏆 Já existe uma final criada — nenhuma nova fase será gerada.");
      return;
    }

    const stageOrder = [
      MatchStage.QUARTER_FINAL,
      MatchStage.SEMI_FINAL,
      MatchStage.FINAL,
    ];

    const nextStage = stageOrder[stageOrder.indexOf(currentStage) + 1];
    if (!nextStage) {
      console.log("🏁 Fim do mata-mata — iniciando finalização do torneio...");
      await this.finishTournament(tournamentId);
      return;
    }

    // Duplication prevention: check if next stage already exists
    const existingNextStage = await this.prisma.match.count({
      where: { tournamentId, stage: nextStage },
    });

    if (existingNextStage > 0) {
      console.log(`⛔ Próxima fase (${nextStage}) já foi criada. Abortando duplicação.`);
      return;
    }

    // pega as partidas finalizadas da fase atual
    const finishedMatches = await this.prisma.match.findMany({
      where: { tournamentId, stage: currentStage, status: MatchStatus.FINISHED },
      select: { winnerId: true },
    });

    if (finishedMatches.length < 2) {
      console.log(`⏳ Ainda aguardando partidas da fase ${currentStage} terminarem`);
      return;
    }

    const winners = finishedMatches.map(m => m.winnerId).filter(Boolean);
    const pairs: Array<[string, string]> = [];

    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i + 1]) pairs.push([winners[i]!, winners[i + 1]!]);
    }

    if (pairs.length === 0) {
      console.log("⚠️ Nenhum par formado para a próxima fase.");
      return;
    }

    console.log(`✅ Criando ${pairs.length} confrontos para ${nextStage}`);
    await this.prisma.match.createMany({
      data: pairs.map(([aId, bId]) => ({
        tournamentId,
        aId,
        bId,
        round: 1,
        stage: nextStage,
        status: MatchStatus.SCHEDULED,
      })),
    });
  }

  async finishTournament(tournamentId: string) {
    // procura a partida final
    const finalMatch = await this.prisma.match.findFirst({
      where: {
        tournamentId,
        stage: MatchStage.FINAL,
        status: MatchStatus.FINISHED,
      },
      select: { winnerId: true },
    });

    if (!finalMatch?.winnerId) {
      console.log("⚠️ Nenhum vencedor encontrado na final.");
      return { message: "Torneio não finalizado — sem vencedor definido." };
    }

    // atualiza torneio como finalizado e zera currentRound (impede novas rodadas automáticas)
    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: TournamentStatus.FINISHED,
        finishedAt: new Date(),
        currentRound: { set: 0 }, // impede novas rodadas automáticas
      },
    });

    // cria log
    await this.prisma.auditLog.create({
      data: {
        action: `Torneio finalizado — Campeão: ${finalMatch.winnerId}`,
        entity: "Tournament",
        entityId: tournamentId,
        userId: finalMatch.winnerId,
      },
    });

    // incrementa pontos do campeão no standing
    await this.prisma.standing.update({
      where: {
        userId_tournamentId: {
          userId: finalMatch.winnerId,
          tournamentId,
        },
      },
      data: {
        points: { increment: 3 },
        wins: { increment: 1 },
      },
    });

    console.log(`🏆 Torneio ${tournamentId} finalizado com campeão: ${finalMatch.winnerId}`);

    return {
      message: "Torneio finalizado com sucesso!",
      championId: finalMatch.winnerId,
    };
  }
}
