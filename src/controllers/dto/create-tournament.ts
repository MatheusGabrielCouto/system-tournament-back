import { TournamentStatus } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString } from "class-validator";

export class CreateTournamentDto {
  @IsString()
  title: string

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus

  @IsDateString()
  startDate: string

  @IsBoolean()
  isPublic: boolean

  @IsOptional()
  @IsDateString()
  endDate?: string

  @IsOptional()
  @IsInt()
  slotsLimit?: number

  @IsOptional()
  @IsInt()
  totalRounds?: number

  @IsString()
  @IsOptional()
  description: string
}