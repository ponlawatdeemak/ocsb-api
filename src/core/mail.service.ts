import { MailerService } from '@nestjs-modules/mailer'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as pug from 'pug'
import * as path from 'path'

@Injectable()
export class MailService {
	constructor(
		private readonly configService: ConfigService,
		private readonly mailerService: MailerService,
	) {}

	async sendUserAccountCreated(userEmail: string, name: string, password: string) {
		const loginUrl = this.configService.get<string>('FRONTEND_LOGIN_URL')
		// Compile the Pug template to HTML
		const html = pug.renderFile(path.join(__dirname, '../../views/userCreatedEmail.pug'), {
			name,
			username: userEmail,
			password,
			loginUrl,
		})
		await this.mailerService.sendMail({
			to: userEmail,
			subject: 'เข้าสู่ระบบครั้งแรก',
			html,
		})
	}

	async sendResetPassword(userEmail: string, name: string, resetLink: string, timeoutHours: number) {
		// Compile the Pug template to HTML
		const html = pug.renderFile(path.join(__dirname, '../../views/resetPasswordEmail.pug'), {
			name,
			userEmail,
			resetLink,
			timeoutHours,
		})
		await this.mailerService.sendMail({
			to: userEmail,
			subject: 'ลืมรหัสผ่าน',
			html,
		})
	}
}
