import { Body, ConflictException, Controller, Get, Param, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { hash } from "bcryptjs";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { CreateEnrollmentDto } from "./dto/create-enrollment";
import { CurrentUser } from "src/auth/current-user-decorator";
import { UserPayload } from "src/auth/jwt.strategy";
import { JwtService } from "@nestjs/jwt";

@Controller('/users')
export class UserController {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService
  ){}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const {email, name, password} = dto
    
    const userWithSameEmail = await this.prisma.user.findUnique({
      where: {
        email
      }
    })

    if(userWithSameEmail) {
      throw new ConflictException('User with same e-mail address already exists.')
    }

    const hashedPassword = await hash(password, 8)

    const user = await this.prisma.user.create({
      data: {email, name, password: hashedPassword, role: 'PLAYER'}
    })

    const tempToken = this.jwt.sign({ sub: user.id, role: user.role }, {
      expiresIn: '5min'
    })

    return {
      id: user.id,
      tempToken,
    }
  }

  @Post('/admin')
  async createAdmin(@Body() dto: CreateUserDto) {
    const {email, name, password} = dto
    
    const userWithSameEmail = await this.prisma.user.findUnique({
      where: {
        email
      }
    })

    if(userWithSameEmail) {
      throw new ConflictException('User with same e-mail address already exists.')
    }

    const hashedPassword = await hash(password, 8)

    await this.prisma.user.create({
      data: {email, name, password: hashedPassword, role: 'ADMIN'}
    })
  }

  @Get('/profile')
  @UseGuards(JwtAuthGuard)
  async getEnrollmentsToUser(@CurrentUser() user: UserPayload) {
    const userSearched = await this.prisma.user.findUnique({
      where: {
        id: user.sub,
      },
      include: {
        enrollments: {
          select: {
            tournament: {
              include: {
                admin: {
                  select: {
                    name: true
                  }
                },
                _count: {
                  select: {
                    enrollments: true
                  }
                },
              }
            }
          }
        },
      }
    })

    if(!userSearched) {
      throw new Error()
    }

    const tournaments = userSearched.enrollments.map(tourn => ({
      id: tourn.tournament.id,
      title: tourn.tournament.title,
      status: tourn.tournament.status,
      description: tourn.tournament.description,
      limit: tourn.tournament.slotsLimit,
      persons: tourn.tournament._count.enrollments,
      admin: tourn.tournament.admin.name,
      start: tourn.tournament.startDate,
      end: tourn.tournament.endDate
    }))

    const {password, createdAt, updatedAt, enrollments, ...userData} = userSearched

    return {...userData, tournaments}
  }

  @Post('/enrollment')
  @UseGuards(JwtAuthGuard)
  async enrollmentUserToTounament(
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() user: UserPayload
  ) {
    const tournamentExists = await this.prisma.tournament.findUnique({
      where: {
        id: dto.tournamentId
      },
      include: {
        enrollments: true
      }
    })
    
    const userRegisted = await this.prisma.enrollment.findMany({
      where: {
        tournamentId: dto.tournamentId,
        userId: user.sub
      }
    })

    if(userRegisted.length > 0) {
      throw new UnauthorizedException("User registed")
    }

    if(!tournamentExists) {
      throw new UnauthorizedException("Tournament not find")
    }

    if (tournamentExists.status !== 'OPEN') {
      throw new UnauthorizedException("Tournament not oppenned")
    }

    if(tournamentExists.slotsLimit === tournamentExists.enrollments.length) {
      throw new UnauthorizedException("Torneio ja tem o maximo de player")
    }

    return this.prisma.enrollment.create({
      data: {
        userId: user.sub,
        tournamentId: dto.tournamentId
      }
    })
  }
}