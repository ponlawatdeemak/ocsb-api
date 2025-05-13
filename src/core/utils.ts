import * as bcrypt from 'bcryptjs'

const BCRYPT_SALT_ROUND = 10
const BCRYPT_SALT = bcrypt.genSaltSync(BCRYPT_SALT_ROUND)

export async function hashPassword(password: string) {
	return hash(password)
}

export async function hash(s: string) {
	const hashed = await bcrypt.hash(s, BCRYPT_SALT)
	return hashed
}

export function generateTokenHex(length) {
	const array = new Uint8Array(length)
	crypto.getRandomValues(array)
	return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function validatePayload(Arry: Array<string>) {
	const checkArray = Array.isArray(Arry) ? trimPayload(Arry) : trimPayload([Arry])
	return checkArray
}

export function trimPayload(Arry: Array<string>) {
	const trimmedData = Arry.map((item) => item.trim())
	return trimmedData
}

export function generateMonthsFromRange(startDate: string, endDate: string): string[] {
	const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
	const result: string[] = []

	const [startYear, startMonth] = startDate.split('-').map(Number)
	const [endYear, endMonth] = endDate.split('-').map(Number)

	let currentYear = startYear
	let currentMonth = startMonth - 1

	while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth - 1)) {
		result.push(`${currentYear}-${months[currentMonth]}-01`)
		currentMonth++

		if (currentMonth === 12) {
			currentMonth = 0
			currentYear++
		}
	}

	while (result.length % 12 !== 0) {
		result.push(`${currentYear}-${months[currentMonth]}-01`)
		currentMonth++
		if (currentMonth === 12) {
			currentMonth = 0
			currentYear++
		}
	}

	return result
}

export function getStartAndEndOfMonth(dateString: string): { startDate: Date; endDate: Date } {
	const date = new Date(dateString)

	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date format: ${dateString}`)
	}

	const startDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1))

	const endDate = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0))

	startDate.setUTCHours(0, 0, 0, 0)
	endDate.setUTCHours(23, 59, 59, 999)

	return { startDate, endDate }
}

export function convertPolygonToWKT(polygon) {
	if (!Array.isArray(polygon) || polygon.length === 0) {
		throw new Error('Invalid polygon data')
	}
	const coordinates = polygon.map(([lon, lat]) => `${lon} ${lat}`).join(', ')
	const wktPolygon = `POLYGON((${coordinates}))`
	return wktPolygon
}

export function validateDate(startDate: string, endDate: string) {
	const start = new Date(startDate)
	const end = new Date(endDate)

	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		return true
	}

	const oneYearInMs = 365 * 24 * 60 * 60 * 1000

	if (end.getTime() - start.getTime() > oneYearInMs) {
		return true
	}
}

// หารอบของข้อมูล ด้วยเดือนและปีค.ศ.
export function getRound(month: number, year: number): { round: number; sDate: string; eDate: string } {
	if (month) {
		const roundConfig = [
			[11, 12, 1, 2],
			[3, 4, 5, 6],
			[7, 8, 9, 10],
		]
		const idx = roundConfig.findIndex((item) => item.includes(month))
		const round = idx + 1
		let roundYearStart = month === 11 || month === 12 ? year : year + 1
		let roundYearEnd = month === 11 || month === 12 ? year + 1 : year
		if (round === 1) {
			if (month === 11 || month === 12) {
				roundYearStart = year
				roundYearEnd = year + 1
			} else {
				roundYearStart = year - 1
				roundYearEnd = year
			}
		} else {
			roundYearStart = year
			roundYearEnd = year
		}
		const startMonth = roundConfig[idx][0] < 10 ? `0${roundConfig[idx][0]}` : roundConfig[idx][0]
		const sDate = `${roundYearStart}-${startMonth}-01`
		const endMonth = roundConfig[idx][roundConfig[idx].length - 1]
		let eDate: Date | string = new Date(roundYearEnd, endMonth, 0)
		eDate.setHours(eDate.getHours() + 7)
		eDate = eDate.toISOString().substring(0, 10)
		return { round, sDate, eDate }
	} else {
		throw new Error('Month not found.')
	}
}
