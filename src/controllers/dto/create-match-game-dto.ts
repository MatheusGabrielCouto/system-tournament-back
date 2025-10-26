import { IsInt, IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateMatchGameDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsString()
  @Length(6, 6, { message: 'O código da batalha deve ter exatamente 6 dígitos.' })
  code: string;
}