import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { LookupController } from './lookup/lookup.controller'
import { ProfileController } from './profile/profile.controller'
import { UMController } from './um/um.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TypeOrmConfigService } from '@libs/typeorm'
import { UsersEntity } from '@interface/entities'
import { RandomService } from './core/random.service'
import { MailService } from './core/mail.service'

let imports = [
	ConfigModule.forRoot({ isGlobal: true }),
	TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
	TypeOrmModule.forFeature([UsersEntity]),
	AuthModule,
]
@Module({
	imports: imports,
	controllers: [LookupController, ProfileController, UMController],
	providers: [RandomService, MailService],
})
export class AppModule {}
