import { IsOptional, IsString } from "class-validator";

export class CreateEnrollmentDto {
  @IsString()
  tournamentId: string
}