import { Module } from '@nestjs/common';
import { TypeService } from './type.service';

@Module({
  providers: [TypeService],
  exports: [TypeService],
})
export class TypeModule {}
