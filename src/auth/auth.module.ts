import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
// import { TypeOrmConfigService } from '@libs/typeorm/typeorm.service'
// import { LutUmFunctionEntity, UserEntity } from '@interface/entities'

@Module({
	imports: [
		// TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
		// TypeOrmModule.forFeature([UserEntity, LutUmFunctionEntity]),
	],
	controllers: [AuthController],
})
export class AuthModule {}
