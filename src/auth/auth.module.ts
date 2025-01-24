import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TypeOrmConfigService } from '@libs/typeorm/typeorm.service'
import { UsersEntity } from '@interface/entities'
import { MailerModule } from '@nestjs-modules/mailer'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MailService } from 'src/core/mail.service'
@Module({
	imports: [
		TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
		TypeOrmModule.forFeature([UsersEntity]),
		MailerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: async (configService: ConfigService) => ({
				transport: {
					host: configService.get<string>('MAIL_HOST'),
					port: configService.get<number>('MAIL_PORT'),
					secure: true,
					auth: {
						user: configService.get<string>('MAIL_USER'),
						pass: configService.get<string>('MAIL_PASS'),
					},
				},
			}),
		}),
	],
	controllers: [AuthController],
	providers: [MailService],
})
export class AuthModule {}
