import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, UnauthorizedException, UseGuards } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateTournamentDto } from "./dto/create-tournament";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { CurrentUser } from "src/auth/current-user-decorator";
import { UserPayload } from "src/auth/jwt.strategy";
import { MatchStage, MatchStatus, TournamentStatus } from "@prisma/client";
import { formatDate } from "src/utils/formats";
import { generatePartialPairings, generateRoundRobin, generateSwissPairingsNoRepeat, shuffleArray } from "src/utils/tournament-helpers.ts";

@Controller('/tournaments')
export class TournamentController {
  constructor(
    private prisma: PrismaService
  ){}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAll(@CurrentUser() user: UserPayload, @Query('filter') filter: TournamentStatus) {

    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: filter ? filter : undefined,
        adminId: user.role === 'ADMIN' ? user.sub : undefined,
        ...(user.role === 'PLAYER' && {
          OR: [
            { isPublic: true },
            { enrollments: { some: { userId: user.sub } } },
          ],
        }),
      },
      include: {
        _count: {
          select: {
            enrollments: true
          }
        },
        admin: {
          select: {
            name: true
          }
        },
      }
    })

    return tournaments.map(t => ({
      ...t,
      limit: t.slotsLimit,
      persons: t._count.enrollments,
      isPublic: undefined,
      _count: undefined,
      adminId: undefined,
      slotsLimit: undefined,
      endDate: undefined,
      startDate: undefined,
      createdAt: undefined,
      admin: t.admin.name,
      start: t.startDate,
      end: t.endDate
    }));
  }

  @Get('/my')
  @UseGuards(JwtAuthGuard)
  async getMyTournaments(@CurrentUser() user: UserPayload, @Query('filter') filter: TournamentStatus) {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: filter ? filter : undefined,
        adminId: user.role === 'ADMIN' ? user.sub : undefined,
        ...(user.role === 'PLAYER' && {
          OR: [
            { isPublic: true },
            { enrollments: { some: { userId: user.sub } } },
          ],
        }),
      },
      include: {
        _count: { select: { enrollments: true } },
        admin: { select: { name: true } },
        enrollments: { select: { userId: true } },
      },
    })

    const enrolledTournaments = tournaments.filter(t =>
      t.enrollments.some(e => e.userId === user.sub)
    )

    const notEnrolledTournaments = tournaments.filter(t =>
      !t.enrollments.some(e => (e.userId === user.sub))
    )

    const formatTournament = (t: any) => ({
      ...t,
      limit: t.slotsLimit,
      persons: t._count.enrollments,
      admin: t.admin.name,
      start: t.startDate,
      end: t.endDate,
      _count: undefined,
      adminId: undefined,
      slotsLimit: undefined,
      startDate: undefined,
      endDate: undefined,
      createdAt: undefined,
      enrollments: undefined,
    })

    return {
      enrolledTournaments: enrolledTournaments.map(formatTournament),
      notEnrolledTournaments: notEnrolledTournaments.map(formatTournament),
    }
  }

  @Get('/:id')
  @UseGuards(JwtAuthGuard)
  async list(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: {
        id
      },
      include: {
        penalties: true,
        matches: {
          omit: {
            id: true,
            tournamentId: true,
            aId: true,
            bId: true,
            decidedAt: true,
            bonusA: true,
            bonusB: true,
            reportedById: true,
            confirmedById: true
          },
          include: {
            playerA: {
              select: {
                name: true,
                id: true,

              }
            },
            playerB: {
              select: {
                name: true,
                id: true
              }
            }
          }
        },
        standings: {
          include: {
            user: {
              select: {
                name: true,
              }
            }
          }
        },
        admin: {
          select: {
            name: true,
          }
        },
        enrollments: {
          include: {
            user: {
              select: {
                name: true,
                email: user.role === 'ADMIN',
              }
            },
          }
        }
      }
    })

    const users = tournament.enrollments.map(use => (
      {
        name: use.user.name,
        email: use.user.email,
        joinedAt: user.role === 'ADMIN' ? formatDate(String(use.joinedAt)) : undefined
      }
    ))

    const {enrollments, ...allData} = tournament

    const isAlreadyEnrolled = tournament.enrollments.some(e => e.userId === user.sub)

    // Calcula posições dos jogadores
    const sortedStandings = tournament.standings
      .map(s => ({
        name: s.user.name,
        points: s.points,
        wins: s.wins,
        losses: s.losses,
        userId: s.userId, // Needed for champion logic
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        return a.losses - b.losses;
      })
      .map((s, i) => ({
        position: i + 1,
        ...s,
      }));

    // Se o torneio estiver finalizado, coloca o campeão em primeiro
    let finalStandings = sortedStandings;
    if (tournament.status === TournamentStatus.FINISHED) {
      const finalMatch = tournament.matches.find(m => m.stage === MatchStage.FINAL && m.winnerId);
      if (finalMatch) {
        const championId = finalMatch.winnerId;
        finalStandings = [
          ...sortedStandings.filter(s => s.userId === championId),
          ...sortedStandings.filter(s => s.userId !== championId)
        ];
      }
    }

    return {
      ...allData,
      users,
      standings: finalStandings,
      isEnrollmentOpen: user.role === 'PLAYER' ? (!isAlreadyEnrolled && tournament.status === TournamentStatus.OPEN && tournament.slotsLimit !== tournament.enrollments.length) : false
    }
  }

  @Get('/:id/public')
  async listPublic(@Param('id') id: string) {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: {
        id
      }
    })

    return tournament
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateTournamentDto,
    @CurrentUser() user: UserPayload
  ) {

    if(user.role !== 'ADMIN') {
      throw new  UnauthorizedException("User not have permitions")
    }

    const tournament = await this.prisma.tournament.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        adminId: user.sub,
      }
    })    

    return tournament
  }

  @Put("/:id")
  @UseGuards(JwtAuthGuard)
  async openEnrollmentsToTournament(@Param("id") id: string, @CurrentUser() user: UserPayload) {
    const tournament = await this.prisma.tournament.findUnique({
      where: {
        id,
        adminId: user.sub
      }
    })

    if(!tournament) throw new BadRequestException("Tournament not found!")

    return this.prisma.tournament.update({
      where: {
        id,
        adminId: user.sub
      },
      data: {
        status: 'OPEN'
      }
    })
  }

  @Put('/:id/start')
  @UseGuards(JwtAuthGuard)
  async startTournament(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { enrollments: true },
    });

    if (!tournament) throw new NotFoundException('Torneio não encontrado');
    if (tournament.adminId !== user.sub) throw new ForbiddenException('Você não é o administrador deste torneio');

    const players = tournament.enrollments.map(e => e.userId);
    if (players.length < 2) throw new BadRequestException('É necessário pelo menos 2 jogadores');

    // inicializa standings
    for (const userId of players) {
      await this.prisma.standing.upsert({
        where: { userId_tournamentId: { userId, tournamentId: id } },
        update: { points: 0, wins: 0, losses: 0, decidedAt: null },
        create: { userId, tournamentId: id },
      });
    }

    // gera rodada 1
    const swissInput = players.map(p => ({ id: p, points: 0 }));
    const round1 = generateSwissPairingsNoRepeat(swissInput, [], 1)[0];

    const BYE_POINTS = 1;
    const matchesToCreate: any[] = [];
    const byes: { userId: string }[] = [];

    for (const pair of round1) {
      if (pair.bye) {
        byes.push({ userId: pair.player });
      } else {
        matchesToCreate.push({
          tournamentId: id,
          aId: pair.playerA,
          bId: pair.playerB,
          stage: MatchStage.GROUP,
          round: 1,
          status: MatchStatus.SCHEDULED,
        });
      }
    }

    // aplica pontos por BYE
    for (const b of byes) {
      await this.prisma.standing.update({
        where: { userId_tournamentId: { userId: b.userId, tournamentId: id } },
        data: { points: { increment: BYE_POINTS } },
      });
    }

    await this.prisma.match.createMany({ data: matchesToCreate });

    const totalRounds = tournament.totalRounds ?? Math.ceil(Math.log2(players.length)) + 1;

    await this.prisma.tournament.update({
      where: { id },
      data: {
        status: TournamentStatus.GROUPS,
        startDate: new Date(),
        currentRound: 1,
        totalRounds,
        autoAdvance: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        action: 'Rodada 1 criada e torneio iniciado',
        entity: 'Tournament',
        entityId: id,
        userId: user.sub,
      },
    });

    return {
      message: 'Rodada 1 criada com sucesso!',
      matches: matchesToCreate.length,
      byes: byes.length,
    };
  }
}