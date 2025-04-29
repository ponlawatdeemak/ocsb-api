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
		const loginUrl = `${process.env.APP_FE_URL}/auth/login`
		// const appLogoUrl = `${process.env.APP_FE_URL}/images/email/mail_header.png`
		// const ocsbLogoUrl = `${process.env.APP_FE_URL}/images/email/mail_ocsb_logo.png`
		const appLogoPath = path.join(__dirname, `../../views/email/app_logo.png`)
		const ocsbLogoPath = path.join(__dirname, `../../views/email/ocsb_logo.png`)
		const html = pug.renderFile(path.join(__dirname, '../../views/userCreatedEmail.pug'), {
			name,
			username: userEmail,
			password,
			loginUrl,
			// appLogoUrl,
			// ocsbLogoUrl,
		})
		await this.mailerService.sendMail({
			to: userEmail,
			subject: 'เข้าสู่ระบบครั้งแรก',
			html,
			from: this.configService.get<string>('MAIL_FROM'),
			attachments: [
				{
					filename: 'app_logo.png',
					path: appLogoPath,
					cid: 'app_logo',
				},
				{
					filename: 'ocsb_logo.png',
					path: ocsbLogoPath,
					cid: 'ocsb_logo',
				},
			],
		})
	}

	async sendResetPassword(userEmail: string, name: string, resetLink: string) {
		const appLogoUrl = `${process.env.APP_FE_URL}/images/email/mail_header.png`
		const ocsbLogoUrl = `${process.env.APP_FE_URL}/images/email/mail_ocsb_logo.png`
		const appLogoPath = path.join(__dirname, `../../views/email/app_logo.png`)
		const ocsbLogoPath = path.join(__dirname, `../../views/email/ocsb_logo.png`)
		const html = pug.renderFile(path.join(__dirname, '../../views/resetPasswordEmail.pug'), {
			name,
			userEmail,
			resetLink,
			appLogoUrl,
			ocsbLogoUrl,
		})

		await this.mailerService.sendMail({
			to: userEmail,
			subject: 'ลืมรหัสผ่าน',
			html,
			from: this.configService.get<string>('MAIL_FROM'),
			attachments: [
				{
					filename: 'app_logo.png',
					path: appLogoPath,
					cid: 'app_logo',
				},
				{
					filename: 'ocsb_logo.png',
					path: ocsbLogoPath,
					cid: 'ocsb_logo',
				},
			],
		})
	}
}
