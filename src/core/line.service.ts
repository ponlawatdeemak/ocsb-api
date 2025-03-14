import { Injectable } from '@nestjs/common'

@Injectable()
export class LineService {
	async send(config: LineMessageConfig): Promise<void> {
		console.log('line msg config:', config)
		console.log('-----')

		const url = 'https://api.line.me/v2/bot/message/push'
		const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN

		for (const lineUserId of config.to) {
			const flexMsgConfig = {
				to: lineUserId,
				messages: [
					{
						type: 'flex',
						altText: 'ข้อความจากระบบ',
						contents: {
							type: 'bubble',
							hero: {
								type: 'image',
								url: config.img,
								size: 'full',
								aspectRatio: '20:13',
								aspectMode: 'cover',
							},
							body: {
								type: 'box',
								layout: 'vertical',
								spacing: 'md',
								contents: [
									{
										type: 'text',
										text: config.title,
										weight: 'bold',
										size: 'xl',
										gravity: 'center',
										wrap: true,
										contents: [],
									},
									{
										type: 'text',
										text: `${config.title}  สถานะ "${config.content.statusName}"  เลขใบแจ้ง ${config.content.incNo}`,
										size: 'sm',
										wrap: true,
										contents: [],
									},
								],
							},
							footer: {
								type: 'box',
								layout: 'horizontal',
								flex: 1,
								contents: [
									{
										type: 'button',
										action: {
											type: 'uri',
											label: 'ดูรายละเอียด',
											uri: `https://liff.line.me/${
												config.isOfficer
													? process.env.LINE_LIFF_ID_OFFICER
													: process.env.LINE_LIFF_ID_PEOPLE
											}/p/incident?id=${config.content.incId}`,
										},
									},
								],
							},
						},
					},
				],
			}
			try {
				await lastValueFrom(
					this.httpService.post(url, JSON.stringify(flexMsgConfig), {
						headers: {
							authorization: `Bearer ${lineAccessToken}`,
							'content-type': 'application/json',
						},
					}),
				)
			} catch (error) {
				console.error('line send flex msg error: ', error.response.data)
				throw error
			}
		}
	}
}
