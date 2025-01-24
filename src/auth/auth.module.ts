import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TypeOrmConfigService } from '@libs/typeorm/typeorm.service'
import { UsersEntity } from '@interface/entities'
@Module({
	imports: [TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }), TypeOrmModule.forFeature([UsersEntity])],
	controllers: [AuthController],
})
export class AuthModule {}
