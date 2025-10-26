import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "src/prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { compare } from "bcryptjs";

@Controller('/sessions')
export class AuthenticateController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService
  ){}

  @Post()
  async handle(@Body() dto: LoginDto) {
    const { email, password } = dto

    const user = await this.prisma.user.findUnique({
      where: {
        email
      }
    })

    if(!user) {
      throw new UnauthorizedException("User credentials do not match")
    }

    const isPasswordValid = await compare(password, user.password)

    if(!isPasswordValid) {
      throw new UnauthorizedException('User credentials do not match')
    }

    const accessToken = this.jwt.sign({ sub: user.id, role: user.role })

    const { password: test, ...userWithoutSensitiveData } = user

    return {
      access_token: accessToken,
    }
  }
}