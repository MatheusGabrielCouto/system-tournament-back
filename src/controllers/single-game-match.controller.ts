import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { PrismaService } from "src/prisma/prisma.service";
import { SingleGameMatchDto } from "./dto/single-game-match";
import { CurrentUser } from "src/auth/current-user-decorator";
import { UserPayload } from "src/auth/jwt.strategy";
import { SingleGameStatus } from "@prisma/client";

@Controller('/single')
export default class SingleGameMatchController {
  constructor(
    private prisma: PrismaService,
  ){}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: SingleGameMatchDto, @CurrentUser() user: UserPayload) {
    return await this.prisma.singleGameMatch.create({
      data: {
        ...dto,
        userId: user.sub,
        status: SingleGameStatus.OPEN
      }
    })
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: UserPayload) {
    const data = await this.prisma.singleGameMatch.findMany({
      include: {
        user: {
          select: {
            name: true
          }
        }
      },
      omit: {
        userId: true
      }
    })

    if(!data) return

    return data
  }
}