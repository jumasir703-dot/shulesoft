import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { SchoolService } from './school.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('schools')
export class SchoolController {
  constructor(private schoolService: SchoolService) {}

  // Public: prospective teachers/students need to pick a school before they have an account.
  @Get()
  findAll() {
    return this.schoolService.findAll();
  }

  // Public for the same reason.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  deactivate(@Param('id') id: string) {
    return this.schoolService.deactivate(id);
  }

  @Patch(':id/reactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(SystemRole.SUPER_ADMIN)
  reactivate(@Param('id') id: string) {
    return this.schoolService.reactivate(id);
  }
}
