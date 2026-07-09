import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentController {
  constructor(private studentService: StudentService) {}

  @Post()
  @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.SUPER_ADMIN)
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthenticatedUser) {
    this.assertSameSchool(user, dto.schoolId);
    return this.studentService.create(dto);
  }

  // ?schoolId=... required unless the caller is SUPER_ADMIN, who may omit it
  // only when also passing it explicitly (kept simple: always required for now).
  @Get()
  @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.TEACHER, SystemRole.SUPER_ADMIN)
  findAll(@Query('schoolId') schoolId: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertSameSchool(user, schoolId);
    return this.studentService.findAllForSchool(schoolId);
  }

  @Get(':id')
  @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.TEACHER, SystemRole.SUPER_ADMIN)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const student = await this.studentService.findOne(id);
    this.assertSameSchool(user, student.schoolId);
    return student;
  }

  @Patch(':id')
  @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.SUPER_ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const student = await this.studentService.findOne(id);
    this.assertSameSchool(user, student.schoolId);
    return this.studentService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles(SystemRole.SCHOOL_ADMIN, SystemRole.SUPER_ADMIN)
  async deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const student = await this.studentService.findOne(id);
    this.assertSameSchool(user, student.schoolId);
    return this.studentService.deactivate(id);
  }

  // SUPER_ADMIN can act across any school; everyone else is confined to their own.
  private assertSameSchool(user: AuthenticatedUser, targetSchoolId: string) {
    if (user.role === SystemRole.SUPER_ADMIN) return;
    if (!targetSchoolId || user.schoolId !== targetSchoolId) {
      throw new ForbiddenException('You do not have access to this school');
    }
  }
}
