import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { GameStatus } from '@prisma/client';
import { MatchGameService } from 'src/services/match-game.service';
import { CreateMatchGameDto } from './dto/create-match-game-dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CurrentUser } from 'src/auth/current-user-decorator';
import { UserPayload } from 'src/auth/jwt.strategy';

@Controller('match-game')
export class MatchGameController {
  constructor(private readonly matchGameService: MatchGameService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateMatchGameDto, @CurrentUser() user: UserPayload) {
    return this.matchGameService.createGame(dto, user);
  }

  @Get('/:matchId')
  @UseGuards(JwtAuthGuard)
  async getGames(@Param('matchId') matchId: string) {
    return this.matchGameService.getGamesByMatch(matchId);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard)
  async updateStatus(@Param('id') id: string, @Body('status') status: GameStatus, @CurrentUser() user: UserPayload) {
    return this.matchGameService.updateGameStatus(id, status, user);
  }

  @Patch('/:id/accept')
  @UseGuards(JwtAuthGuard)
  async acceptGame(@Param('id') id: string, @Body('status') status: GameStatus, @CurrentUser() user: UserPayload) {
    return this.matchGameService.acceptGame(id, user);
  }

  @Patch('/:id/report')
  @UseGuards(JwtAuthGuard)
  async reportStauts(@Param('id') id: string, @Body('winnerUserId') winnerUserId: string, @CurrentUser() user: UserPayload) {
    return this.matchGameService.reportGameResult(id, winnerUserId, user)
  }

  @Patch('/:id/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmGameResult(@Param('id') id: string, @CurrentUser() user: UserPayload) {
    return this.matchGameService.confirmGameResult(id, user)
  }
}