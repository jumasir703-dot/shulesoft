import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    const school = await this.prisma.school.findUnique({ where: { id: dto.schoolId } });
    if (!school || !school.isActive) {
      throw new NotFoundException('Invalid or inactive school');
    }

    const existing = await this.prisma.student.findUnique({
      where: { schoolId_admissionNumber: { schoolId: dto.schoolId, admissionNumber: dto.admissionNumber } },
    });
    if (existing) {
      throw new ConflictException('A student with this admission number already exists at this school');
    }

    return this.prisma.student.create({
      data: {
        schoolId: dto.schoolId,
        admissionNumber: dto.admissionNumber,
        fullName: dto.fullName,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        curriculumType: dto.curriculumType,
        currentStreamId: dto.currentStreamId,
      },
    });
  }

  async findAllForSchool(schoolId: string) {
    return this.prisma.student.findMany({
      where: { schoolId },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    return this.prisma.student.update({
      where: { id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.student.update({ where: { id }, data: { isActive: false } });
  }
}
