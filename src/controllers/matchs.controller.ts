import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { MatchStatus } from "@prisma/client";
import { CurrentUser } from "src/auth/current-user-decorator";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { UserPayload } from "src/auth/jwt.strategy";
import { PrismaService } from "src/prisma/prisma.service";

@Controller('/matchs')
export class MatchsController {
  constructor(
    private prisma: PrismaService
  ){}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getMatchs(
    @CurrentUser() user: UserPayload,
    @Query("filter") filter: MatchStatus
  ) {
    const maths = await this.prisma.match.findMany({
      where: {
        OR: [{ aId: user.sub }, { bId: user.sub }],
        status: filter ? filter : undefined
      },
      orderBy: {
        status: 'asc'
      },
      include: {
        tournament: {
          select: {
            title: true,
            description: true
          }
        },
        playerA: {
          select: {
            name: true,
            id: true
          }
        },
        games: {
          select: {
            code: true,
            id: true,
            status: true
          }
        },
        playerB: {
          select: {
            name: true,
            id: true
          }
        }
      }
    })

    const formated = maths.map(match => ({
      id: match.id,
      stage: match.stage,
      status: match.status,
      score: match.aId === user.sub ? match.scoreA : match.scoreB,
      bonus: match.aId === user.sub ? match.bonusA : match.bonusB,
      enemy: match.aId === user.sub ? {
        name: match.playerB.name,
        id: match.playerB.id
      } : {
        name: match.playerA.name,
        id: match.playerA.id
      },
      tournament: match.tournament,
      games: match.games
    }))

    return formated
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  async getMatch(
    @CurrentUser() user: UserPayload,
    @Param("id") id: string
  ) {
    const match = await this.prisma.match.findUnique({
      where: {
        id,
      },
      omit: {
        bonusA: true,
        bonusB: true,
        reportedById: true,
        confirmedById: true,
        decidedAt: true,
        bId: true,
        aId: true
      },
      include: {
        playerA: {
          select: {
            name: true,
            id: true
          }
        },
        playerB: {
          select: {
            name: true,
            id: true
          }
        },
        games: {
          include: {
            host: {
              select: {
                name: true
              }
            },
            winnerUser: {
              select: {
                name: true,
              }
            }
          }
        },
        tournament: {
          select: {
            title: true,
            description: true
          }
        }
      }
    })

    return match
  }
}