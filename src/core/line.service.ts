import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { lastValueFrom } from 'rxjs'
import * as moment from 'moment-timezone'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { RegionsEntity, SugarcaneHotspotEntity } from '@interface/entities'
import { EntityManager, Not, Repository } from 'typeorm'

export interface LineMessageConfig {
	title: string
	to: string[]
}

@Injectable()
export class LineService {
	constructor(
		private readonly httpService: HttpService,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly repoHotspot: Repository<SugarcaneHotspotEntity>,

		@InjectRepository(RegionsEntity)
		private readonly repoRegion: Repository<RegionsEntity>,

		@InjectEntityManager()
		private readonly entityManager: EntityManager,
	) {
		// moment.tz.setDefault('Asia/Bangkok')
	}
	private readonly logger = new Logger(LineService.name)

	@Cron(CronExpression.EVERY_DAY_AT_8AM, {
		// @Cron('*/10 * * * * ', {
		name: 'task_08_am',
		timeZone: 'Asia/Bangkok',
	})
	handleMorningCronWithExpression() {
		this.sendDailyData(1)
	}

	@Cron(CronExpression.EVERY_DAY_AT_5PM, {
		name: 'task_05_pm',
		timeZone: 'Asia/Bangkok',
	})
	handleEveningCronWithExpression() {
		this.sendDailyData(2)
	}

	private async sendDailyData(round: 1 | 2): Promise<void> {
		const currentDate = moment().utcOffset(0, true).startOf('date').toDate()
		const notiData = await this.getNotiData(currentDate, round)
		const regionList = await this.repoRegion.find({
			where: { regionId: Not(5) },
			relations: ['provinces'],
			order: { regionId: 'ASC' },
		})
		const today = this.getThaiFormattedDate(currentDate)
		const total = {
			count: 0,
			inSugarcane: 0,
			outSugarcane: 0,
		}
		const regionMsg = regionList.map((item) => {
			const matchItem = notiData.find((data) => data.regionId === item.regionId)
			const provList = item.provinces.map((prov) => prov.provinceName)
			total.count += matchItem?.count || 0
			total.inSugarcane += matchItem?.inSugarcane || 0
			total.outSugarcane += matchItem?.outSugarcane || 0
			return `
				📌 ภาค ${item.regionId} (${provList.join()})
				ในแปลงอ้อย ${matchItem?.inSugarcane || 0} จุด
				นอกแปลงอ้อย ${matchItem?.outSugarcane || 0} จุด`
		})

		const msg = `🔥Burntracking Alert ! การแจ้งเตือนการเกิดจุดความร้อนในพื้นที่ปลูกอ้อย  
				วันที่ ${today}
				จุดความร้อนทั้งหมด ${total.count} จุด
				ในแปลงอ้อย ${total.inSugarcane} จุด
				นอกแปลงอ้อย ${total.outSugarcane} จุด				
				${regionMsg.join('\n')}
			`
		this.sendMsg(msg, round)
	}

	async sendMsg(text: string, round: 1 | 2): Promise<void> {
		// https://developers.line.biz/en/reference/messaging-api/#send-broadcast-message

		// const url = 'https://api.line.me/v2/bot/message/push'
		const url = 'https://api.line.me/v2/bot/message/broadcast'
		const lineAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
		const linkUrl = `${process.env.APP_FE_URL}/auth/login?app_callback=${process.env.APP_BE_URL}/export/hotspot-region`
		const msgImg = {
			type: 'imagemap',
			baseUrl: `${process.env.APP_BE_URL}/profile/line/img`,
			altText: '🔥Burntracking Alert !',
			baseSize: { width: 1040, height: 1040 },
			actions: [
				{
					type: 'uri',
					area: { x: 90, y: 375, width: 340, height: 85 },
					linkUri: `${linkUrl}/1/${round}`,
				},
				{
					type: 'uri',
					area: { x: 610, y: 375, width: 340, height: 85 },
					linkUri: `${linkUrl}/2/${round}`,
				},
				{
					type: 'uri',
					area: { x: 90, y: 900, width: 340, height: 85 },
					linkUri: `${linkUrl}/3/${round}`,
				},
				{
					type: 'uri',
					area: { x: 610, y: 900, width: 340, height: 85 },
					linkUri: `${linkUrl}/4/${round}`,
				},
			],
		}
		const msgTxt = { type: 'text', text }

		const msgConfig = { messages: [msgImg, msgTxt] }
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

	private getThaiFormattedDate(date: Date) {
		const thaiMonths = [
			'มกราคม',
			'กุมภาพันธ์',
			'มีนาคม',
			'เมษายน',
			'พฤษภาคม',
			'มิถุนายน',
			'กรกฎาคม',
			'สิงหาคม',
			'กันยายน',
			'ตุลาคม',
			'พฤศจิกายน',
			'ธันวาคม',
		]

		const day = date.getDate()
		const month = thaiMonths[date.getMonth()]
		const year = date.getFullYear() + 543 // Convert Gregorian to Buddhist year

		return `${day} ${month} ${year}`
	}

	private async getNotiData(date: Date, round: 1 | 2) {
		let dateStart = moment(date)
		let dateEnd = moment(date)
		if (round === 1) {
			dateStart = moment(date).subtract(7, 'hours')
			dateEnd = moment(date).add(7, 'hours')
		} else if (round === 2) {
			dateStart = moment(date).add(7, 'hours')
			dateEnd = moment(date).add(17, 'hours')
		}

		const statement = `
			select 
				region_id,
				count(id),
				SUM(CASE WHEN sh.in_sugarcane  = TRUE THEN 1 ELSE 0 END) AS in_sugarcane,
				SUM(CASE WHEN in_sugarcane = FALSE THEN 1 ELSE 0 END) AS out_sugarcane
			from sugarcane.sugarcane_hotspot sh
			where (sh.acq_date > '${dateStart.toISOString()}' ) 
			and (sh.acq_date <= '${dateEnd.toISOString()}' )
			group by region_id
		`
		const temp = await this.entityManager.query(statement)
		const formatData = temp.map((item) => {
			return {
				regionId: Number(item.region_id),
				count: Number(item.count),
				inSugarcane: Number(item.in_sugarcane),
				outSugarcane: Number(item.out_sugarcane),
			}
		})

		return formatData
	}
}
