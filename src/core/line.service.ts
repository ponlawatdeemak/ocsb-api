import { HttpService } from '@nestjs/axios'
import { Injectable } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'

export interface LineMessageConfig {
	title: string
	to: string[]
}

@Injectable()
export class LineService {
	constructor(private readonly httpService: HttpService) {}

	async send(config: LineMessageConfig): Promise<void> {
		console.log('line msg config:', config)
		console.log('-----')

		const url = 'https://api.line.me/v2/bot/message/push'
		const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

		for (const lineUserId of config.to) {
			const msgImg = {
				type: 'imagemap',
				baseUrl: ``,
				altText: 'This is an imagemap',
				baseSize: {
					width: 1040,
					height: 1040,
				},
				actions: [
					{
						type: 'uri',
						area: {
							x: 90,
							y: 375,
							width: 340,
							height: 85,
						},
						linkUri: 'https://google.com',
					},
					{
						type: 'uri',
						area: {
							x: 610,
							y: 375,
							width: 340,
							height: 85,
						},
						linkUri: 'https://google.com',
					},
					{
						type: 'uri',
						area: {
							x: 90,
							y: 900,
							width: 340,
							height: 85,
						},
						linkUri: 'https://google.com',
					},
					{
						type: 'uri',
						area: {
							x: 610,
							y: 900,
							width: 340,
							height: 85,
						},
						linkUri: 'https://google.com',
					},
				],
			}
			const msgTxt = {
				type: 'text',
				text: `
					🔥Burntracking Alert ! การแจ้งเตือนการเกิดจุดความร้อนในพื้นที่ปลูกอ้อย  
					วันที่ 4 มีนาคม 2568
					จุดความร้อนทั้งหมด 20 จุด
					ในแปลงอ้อย 2 จุด
					นอกแปลงอ้อย 18 จุด
					
					📌 ภาค 1 (สระบุรี)
					ในแปลงอ้อย 2 จุด
					นอกแปลงอ้อย 18 จุด
					
					📌 ภาค 2 (เพชรบูรณ์)
					ในแปลงอ้อย 2 จุด
					นอกแปลงอ้อย 18 จุด
					
					📌 ภาค 3 (สระแก้ว)
					ในแปลงอ้อย 2 จุด
					นอกแปลงอ้อย 18 จุด
					
					📌 ภาค 4 (ขอนแก่น)
					ในแปลงอ้อย 2 จุด
					นอกแปลงอ้อย 18 จุด
				`,
			}

			const msgConfig = { to: lineUserId, messages: [msgImg, msgTxt] }
			try {
				await lastValueFrom(
					this.httpService.post(url, JSON.stringify(msgConfig), {
						headers: { authorization: `Bearer ${lineAccessToken}`, 'content-type': 'application/json' },
					}),
				)
			} catch (error) {
				console.error('line send flex msg error: ', error.response.data)
				throw error
			}
		}
	}
}
