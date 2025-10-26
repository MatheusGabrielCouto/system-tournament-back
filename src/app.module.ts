import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './env';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './modules/prisma.module';
import { AuthenticateController } from './controllers/authenticate.controller';
import { UserController } from './controllers/user.controller';
import { TournamentController } from './controllers/tournament.controller';
import { MatchsController } from './controllers/matchs.controller';
import { MatchGameController } from './controllers/match-game.controller';
import { MatchGameService } from './services/match-game.service';
import SingleGameMatchController from './controllers/single-game-match.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate: env => envSchema.parse(env),
      isGlobal: true
    }),
    AuthModule,
    PrismaModule,
  ],
  controllers: [
    AuthenticateController,
    UserController,
    TournamentController,
    MatchsController,
    MatchGameController,
    SingleGameMatchController
  ],
  providers: [
    MatchGameService
  ],
})
export class AppModule {}
