import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SingleGameMatchDto {
  @IsString()
  @IsNotEmpty()
  title: string

  @IsString()
  @Length(6, 6, { message: 'O código da batalha deve ter exatamente 6 dígitos.' })
  code: string

  @IsString()
  description: string
}