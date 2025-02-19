import { ResponseDto } from '@interface/config/app.config'
import { Controller, Get, Query } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, Between } from 'typeorm'
import {
	GetBurntOverviewDtoIn,
	GetHeatPointsOverviewDtoIn,
	GetHeatPointsSugarcaneOverviewDtoIn,
	GetPlantOverviewDtoIn,
	GetProductOverviewDtoIn,
	GetProductPredictOverviewDtoIn,
	GetSummaryOverviewDtoIn,
} from '@interface/dto/overview/overview.dto-in'
import {
	GetBurntOverviewDtoOut,
	GetHeatPointsOverviewDtoOut,
	GetHeatPointsSugarcaneOverviewDtoOut,
	GetPlantOverviewDtoOut,
	GetProductOverviewDtoOut,
	GetProductPredictOverviewDtoOut,
	GetReplantOverviewDtoOut,
	GetSummaryOverviewDtoOut,
} from '@interface/dto/overview/overview.dto-out'
import { YearProductionEntity } from '@interface/entities'
import { SugarcaneHotspotEntity } from '@interface/entities/sugarcane-hotspot.entity'
@Controller('overview')
export class OverviewController {
	constructor(
		@InjectDataSource()
		private readonly dataSource: DataSource,

		@InjectRepository(YearProductionEntity)
		private readonly yearProductionEntity: Repository<YearProductionEntity>,

		@InjectRepository(SugarcaneHotspotEntity)
		private readonly sugarcaneHotspotEntity: Repository<SugarcaneHotspotEntity>,
	) {}

	@Get('summary')
	async getSummary(@Query() payload: GetSummaryOverviewDtoIn): Promise<ResponseDto<GetSummaryOverviewDtoOut>> {
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const cntHotspot = await this.sugarcaneHotspotEntity.count({
			where: {
				acqDate: Between(new Date(yearLookupCondition.hotspotStart), new Date(yearLookupCondition.hotspotEnd)),
			},
		})
		const burnAreaQuery = await this.dataSource.query(
			`select COALESCE(SUM(sdba.area_m2),0) as m2,
				COALESCE(SUM(sdba.area_km2),0) as km2, 
				COALESCE(SUM(sdba.area_rai),0) as rai,
				COALESCE(SUM(sdba.area_hexa),0) as hexa 
			from sugarcane.sugarcane.sugarcane_ds_burn_area sdba 
			where DATE(sdba.detected_d) BETWEEN $1 and $2
			`,
			[new Date(yearLookupCondition.burnAreaStart), new Date(yearLookupCondition.burnAreaEnd)],
		)
		Object.keys(burnAreaQuery[0]).forEach((key) => {
			burnAreaQuery[0][key] = Number(burnAreaQuery[0][key])
		})
		const yieldPredQuery = await this.dataSource.query(
			`select SUM(sdyp.area_m2) as m2, 
				SUM(sdyp.area_km2) as km2, 
				SUM(sdyp.area_rai) as rai, 
				SUM(sdyp.area_hexa) as hexa, 
				SUM(sdyp.production_kg) as kg, 
				SUM(sdyp.production_ton) as ton
			from sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
			where sdyp.cls_round = $1 and EXTRACT(YEAR FROM sdyp.cls_edate) = $2
			`,
			[yearLookupCondition.sugarcaneRound, yearLookupCondition.sugarcaneYear],
		)

		Object.keys(yieldPredQuery[0]).forEach((key) => {
			yieldPredQuery[0][key] = Number(yieldPredQuery[0][key])
		})

		const data: GetSummaryOverviewDtoOut = {
			hotspot: cntHotspot,
			burnArea: burnAreaQuery[0],
			sugarcaneVolume: { ton: yieldPredQuery[0].ton, kg: yieldPredQuery[0].kg },
			yieldPred: {
				m2: yieldPredQuery[0].m2,
				km2: yieldPredQuery[0].km2,
				rai: yieldPredQuery[0].rai,
				hexa: yieldPredQuery[0].hexa,
			},
		}

		return new ResponseDto<GetSummaryOverviewDtoOut>({ data })
	}

	@Get('heat-points')
	async getHeatPoints(
		@Query() payload: GetHeatPointsOverviewDtoIn,
	): Promise<ResponseDto<GetHeatPointsOverviewDtoOut[]>> {
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const queryResult = await this.dataSource.query(
			`with filtered_data as (
				select * 
				from sugarcane.sugarcane.sugarcane_hotspot
				where acq_date between $1 and $2
			), count_filtered_hotspot as (
				select count(*) as total_count
				from filtered_data
			)
			select 
				fd.region_id,
				r.region_name,
				r.region_name_en,
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces,
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en,
				count(*) as region_count,
				round((count(*) * 100.0) / (select total_count from count_filtered_hotspot), 2) as region_hotspot
			from filtered_data fd
			left join sugarcane.sugarcane.regions r on fd.region_id = r.region_id 
			left join sugarcane.sugarcane.provinces p on fd.region_id = p.region_id 
			where fd.region_id < 5 and fd.region_id is not null
			group by fd.region_id ,r.region_name,r.region_name_en 
			order by fd.region_id
			`,
			[yearLookupCondition.hotspotStart, yearLookupCondition.hotspotEnd],
		)

		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionName: e.region_name,
				regionNameEn: e.region_name_en,
				provinces: e.provinces,
				provincesEn: e.provinces_en,
				regionCount: Number(e.region_count),
				regionHotspot: Number(e.region_hotspot),
			}
		})

		return new ResponseDto<GetHeatPointsOverviewDtoOut[]>({ data })
	}

	@Get('heat-points-sugarcane')
	async getHeatPointsSugarcane(
		@Query() payload: GetHeatPointsSugarcaneOverviewDtoIn,
	): Promise<ResponseDto<GetHeatPointsSugarcaneOverviewDtoOut[]>> {
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const queryResult = await this.dataSource.query(
			`SELECT 
					r.region_id,-- Dto Out : regionId
					r.region_name,
					r.region_name_en,
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces,
					ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en,
					COUNT(*) AS region_count, -- Dto Out : regionCount
					COUNT(CASE WHEN sh.in_sugarcane = true THEN 1 END) AS in_sugarcane, -- Dto Out : inSugarcan
					COUNT(CASE WHEN sh.in_sugarcane = false THEN 1 END) AS not_in_sugarcane -- Dto Out : notInSugarcan
				from sugarcane.sugarcane.regions r
				left join sugarcane.sugarcane.provinces p on r.region_id = p.region_id 
				left join sugarcane.sugarcane.sugarcane_hotspot sh on r.region_id = sh.region_id		
				where sh.acq_date -- Where ด้วย Date ที่เป็น Lookup จาก Table year_production
					BETWEEN $1 and $2  and 
					r.region_id < 5
				GROUP BY r.region_id,r.region_name,r.region_name_en -- GROUP ด้วยภูมิภาค
				ORDER BY r.region_id; -- ORDER ด้วยภูมิภาค 
			`,
			[yearLookupCondition.hotspotStart, yearLookupCondition.hotspotEnd],
		)

		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionName: e.region_name,
				regionNameEn: e.region_name_en,
				provinces: e.provinces,
				provincesEn: e.provinces_en,
				regionCount: Number(e.region_count),
				inSugarcane: Number(e.in_sugarcane),
				notInSugarcane: Number(e.not_in_sugarcane),
			}
		})

		return new ResponseDto<GetHeatPointsSugarcaneOverviewDtoOut[]>({ data })
	}

	@Get('burnt')
	async getBurnt(@Query() payload: GetBurntOverviewDtoIn): Promise<ResponseDto<GetBurntOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH month_series AS (
				-- สร้างช่วงเดือนทั้งหมดในช่วง burn_area_start - burn_area_end
				SELECT generate_series(
					(SELECT DATE_TRUNC('month', yp.burn_area_start) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), -- id จาก query param
					(SELECT DATE_TRUNC('month', yp.burn_area_end) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), -- id จาก query param
					'1 month'
				)::date AS month
			),
			region_series AS (
				-- ดึง region_id ทั้งหมดจาก Table lookup
				SELECT r.region_id,
					r.region_name, 
					r.region_name_en,
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces,
					ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en
				FROM sugarcane.sugarcane.regions r
				LEFT JOIN sugarcane.sugarcane.provinces p ON p.region_id = r.region_id
				WHERE r.region_id < 5
				GROUP BY r.region_id
			),
			aggregated_data AS (
				-- คำนวณค่าผลรวมของแต่ละเดือนและ region
				SELECT 
					ms.month,
					rs.region_id,
					COALESCE(SUM(sdba.area_m2), 0) AS m2,
					COALESCE(SUM(sdba.area_km2), 0) AS km2,
					COALESCE(SUM(sdba.area_rai), 0) AS rai,
					COALESCE(SUM(sdba.area_hexa), 0) AS hexa
				FROM month_series ms
				CROSS JOIN region_series rs
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_burn_area sdba
					ON DATE_TRUNC('month', sdba.detected_d) = ms.month
					AND sdba.region_id = rs.region_id
				GROUP BY ms.month, rs.region_id
			)
			SELECT 
				rs.region_id,
				rs.region_name,
				rs.region_name_en,
				rs.provinces,
				rs.provinces_en,
				JSON_AGG(
					JSON_BUILD_OBJECT(
						'month', TO_CHAR(ad.month, 'YYYY-MM-01'),
						'area',json_build_object(
						'm2', ad.m2,
						'km2', ad.km2,
						'rai', ad.rai,
						'hexa', ad.hexa
						) 
					)
					ORDER BY ad.month
				) AS monthly_data
			FROM region_series rs
			LEFT JOIN aggregated_data ad ON ad.region_id = rs.region_id
			GROUP BY rs.region_id, rs.region_name, rs.region_name_en, rs.provinces, rs.provinces_en
			ORDER BY rs.region_id;
			`,
			[payload.id],
		)

		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionName: e.region_name,
				regionNameEn: e.region_name_en,
				provinces: e.provinces,
				provincesEn: e.provinces_en,
				monthlyData: e.monthly_data,
			}
		})

		return new ResponseDto<GetBurntOverviewDtoOut[]>({ data })
	}

	@Get('plant')
	async getPlant(@Query() payload: GetPlantOverviewDtoIn): Promise<ResponseDto<GetPlantOverviewDtoOut>> {
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const queryResult = await this.dataSource.query(
			`WITH total_area AS ( -- Table Temp ไว้หาค่าพื้นที่ทั้งหมดของแต่ละหน่วย
					SELECT 
						SUM(sdyp2.area_m2) AS m2, -- พื้นที่ทั้งหมดหน่วยตารางเมตร
						SUM(sdyp2.area_rai) AS rai, -- พื้นที่ทั้งหมดหน่วยไร่
						SUM(sdyp2.area_km2) AS km2, -- พื้นที่ทั้งหมดหน่วยตารางกิโลเมตร
						SUM(sdyp2.area_hexa) AS hexa  -- พื้นที่ทั้งหมดหน่วย Hexa
					FROM sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp2 -- Table sugarcane_ds_yield_pred
					JOIN sugarcane.sugarcane.year_production yp -- Join กับ Table lookup เพื่อเอา Data ปีและรอบ
						ON yp.id = sdyp2.id -- id จาก query param
					WHERE sdyp2.cls_round = yp.sugarcane_round -- Where ด้วยรอบและปีตาม Lookup
					AND DATE(sdyp2.cls_edate) BETWEEN TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD')
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
				)
				SELECT 
					r.region_id, -- Dto Out : regionId
					r.region_name,
					r.region_name_en,
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
					ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en,
					COALESCE(SUM(sdyp.area_m2), 0) AS m2, -- Dto Out : m2
					COALESCE(SUM(sdyp.area_rai), 0) AS rai, -- Dto Out : rai
					COALESCE(SUM(sdyp.area_km2), 0) AS km2, -- Dto Out : km2
					COALESCE(SUM(sdyp.area_hexa), 0) AS hexa, -- Dto Out : hexa
					ROUND(COALESCE(SUM(sdyp.area_m2), 0) / ta.m2 * 100, 2) AS m2_percent, -- Dto Out : m2Percent
					ROUND(COALESCE(SUM(sdyp.area_rai), 0) / ta.rai * 100, 2) AS rai_percent, -- Dto Out : raiPercent
					ROUND(COALESCE(SUM(sdyp.area_km2), 0) / ta.km2 * 100, 2) AS km2_percent, -- Dto Out : km2Percent
					ROUND(COALESCE(SUM(sdyp.area_hexa), 0) / ta.hexa * 100, 2) AS hexa_percent -- Dto Out : hexaPercent
				FROM sugarcane.sugarcane.regions r -- เริ่มจาก Regions เพื่อนำไปหา พื้นที่ของแต่ละภูมิภาคที่มี
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- ไป join กับ Table ที่มีข้อมูลพื้นที่ด้วย region_id
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = $1
					AND DATE(sdyp.cls_edate) BETWEEN (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 -- id จาก query param
					) AND (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 -- id จาก query param
					)
				LEFT JOIN sugarcane.sugarcane.provinces p -- join กับ Table ที่มีข้อมูลของจังหวัดแต่ละภาค
					ON p.region_id = r.region_id
				LEFT JOIN total_area ta ON true  -- join กับ total_area เพื่อนำคำนวณพื้นที่ทั้งหมดด้านบนมาใช้
				where r.region_id < 5
				GROUP BY r.region_id, ta.rai, ta.m2, ta.km2, ta.hexa
				ORDER BY r.region_id;
			`,
			[yearLookupCondition.sugarcaneRound, yearLookupCondition.id],
		)
		const totalArea = queryResult.reduce(
			(acc, obj) => {
				acc.m2 += Number(obj.m2) || 0
				acc.km2 += Number(obj.km2) || 0
				acc.rai += Number(obj.rai) || 0
				acc.hexa += Number(obj.hexa) || 0
				return acc
			},
			{ m2: 0, km2: 0, rai: 0, hexa: 0 },
		)

		const regionArea = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionName: e.region_name,
				regionNameEn: e.region_name_en,
				provinces: e.provinces,
				provincesEn: e.provinces_en,
				area: {
					m2: Number(e.m2),
					km2: Number(e.km2),
					rai: Number(e.rai),
					hexa: Number(e.hexa),
				},
				percent: {
					m2: Number(e.m2_percent),
					km2: Number(e.km2_percent),
					rai: Number(e.rai_percent),
					hexa: Number(e.hexa_percent),
				},
			}
		})

		return new ResponseDto<GetPlantOverviewDtoOut>({ data: { totalArea, regionArea } })
	}

	@Get('product')
	async getProduct(@Query() payload: GetProductOverviewDtoIn): Promise<ResponseDto<GetProductOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`select 
				r.region_id,
				r.region_name, 
				r.region_name_en, 
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				-- ตั้งชื่อ Dto Out ประมาณนี้เพื่อให้ FE เอา Config ต่อกันเป็น string ได้
				SUM(sdyp.yield_mean_kg_m2) as yield_mean_kg_m2, -- Dto Out : kg_m2
				SUM(sdyp.yield_mean_kg_km2) as yield_mean_kg_km2, -- Dto Out : kg_km2
				SUM(sdyp.yield_mean_kg_rai) as yield_mean_kg_rai, -- Dto Out : kg_rai
				SUM(sdyp.yield_mean_kg_hexa) as yield_mean_kg_hexa, -- Dto Out : kg_hexa
				SUM(sdyp.yield_mean_ton_m2) as yield_mean_ton_m2, -- Dto Out : ton_m2
				SUM(sdyp.yield_mean_ton_km2) as yield_mean_ton_km2, -- Dto Out : ton_km2
				SUM(sdyp.yield_mean_ton_rai) as yield_mean_ton_rai, -- Dto Out : ton_rai
				SUM(sdyp.yield_mean_ton_hexa) as yield_mean_ton_hexa -- Dto Out : ton_hexa
				FROM sugarcane.sugarcane.regions r -- เริ่มจาก Table region เพื่อให้ตั้งต้นตามภูมิภาค
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- join กับ Table ที่มีข้อมูลพื้นที่ด้วย region_id
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = ( -- เพิ่มเงื่อนไขเอาเฉพาะ Data ที่อยู่ใน Period โดยอ้างอิงจาก Lookup Table 
						SELECT yp.sugarcane_round 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					)
					AND DATE(sdyp.cls_edate) BETWEEN (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					) AND (
						SELECT TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 -- id จาก query param
					)
				LEFT JOIN sugarcane.sugarcane.provinces p -- join กับ Table ที่มีข้อมูลของจังหวัดแต่ละภาค
					ON p.region_id = r.region_id
				where r.region_id < 5 
				group by r.region_id 
				order by r.region_id ; 
			`,
			[payload.id],
		)

		const data = queryResult.map((e) => {
			return {
				regionId: e.region_id,
				regionName: e.region_name,
				regionNameEn: e.region_name_en,
				provinces: e.provinces,
				provincesEn: e.provinces_en,
				kg: {
					m2: Number(e.yield_mean_kg_m2),
					km2: Number(e.yield_mean_kg_km2),
					rai: Number(e.yield_mean_kg_rai),
					hexa: Number(e.yield_mean_kg_hexa),
				},
				ton: {
					m2: Number(e.yield_mean_ton_m2),
					km2: Number(e.yield_mean_ton_km2),
					rai: Number(e.yield_mean_ton_rai),
					hexa: Number(e.yield_mean_ton_hexa),
				},
			}
		})

		return new ResponseDto<GetProductOverviewDtoOut[]>({ data })
	}

	@Get('product-predict')
	async getProductPredict(
		@Query() payload: GetProductPredictOverviewDtoIn,
	): Promise<ResponseDto<GetProductPredictOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH last_4_years AS ( -- สร้าง Table Temp สำหรับ Get ปีย้อนหลัง 4 ปี
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 -- id จาก query param
				ORDER BY id DESC
				LIMIT 4 -- ย้อนหลัง 4 
			)
			SELECT 
				yp.id as year_id, -- id ของ ปี
				yp.name as year_name, -- ชื่อของปีภาษาไทย
				yp.name_en as year_name_en, -- ชื่อของปีภาษาอังกฤษ
				r.region_id, -- id ภูมิภาค
				r.region_name, -- ชื่อของภูมิภาษาไทย
				r.region_name_en, -- ชื่อของภูมิภาษาอังกฤษ
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				COALESCE(SUM(sdyp.production_kg), 0) as production_kg, -- ผลรวมของอ้อยหน่วยเป็นกิโลกรัม รวมกันตาม ปีและภายในภูมิภาคนั้นๆ 
				COALESCE(SUM(sdyp.production_ton), 0) as production_ton -- ผลรวมของอ้อยหน่วยเป็นตัน รวมกันตาม ปีและภายในภูมิภาคนั้นๆ 
			FROM last_4_years yp -- Table temp 
			CROSS JOIN sugarcane.sugarcane.regions r -- join กับ ภูมิภาคเพื่อเอาภาคทั้งหมด
			left join sugarcane.sugarcane.provinces p on p.region_id = r.region_id
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp -- ่join กับ table ที่มี data ของอ้อย
				ON sdyp.region_id = r.region_id -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND sdyp.cls_round = yp.sugarcane_round 
				AND DATE(sdyp.cls_edate) 
					BETWEEN TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD') 
			where r.region_id  < 5
			GROUP BY yp.id, yp.name, r.region_id, yp.name_en, sdyp.cls_edate
			ORDER BY yp.id ASC, r.region_id; 
			`,
			[payload.id],
		)

		let groupedData = queryResult.reduce((acc, item) => {
			if (!acc[item.region_id]) {
				acc[item.region_id] = {
					regionId: item.region_id,
					regionName: item.region_name,
					regionNameEn: item.region_name_en,
					provinces: item.provinces,
					provincesEn: item.provinces_en,
					years: [],
				}
			}

			const yearData = {
				yearId: item.year_id,
				yearName: item.year_name,
				yearNameEn: item.year_name_en,
				weight: {
					kg: Number(item.production_kg),
					ton: Number(item.production_ton),
				},
			}

			acc[item.region_id].years.push(yearData)

			return acc
		}, {})

		let data: GetProductPredictOverviewDtoOut[] = Object.values(groupedData)
		return new ResponseDto<GetProductPredictOverviewDtoOut[]>({ data })
	}

	@Get('replant')
	async getReplant(
		@Query() payload: GetProductPredictOverviewDtoIn,
	): Promise<ResponseDto<GetReplantOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH last_3_years AS ( -- สร้าง Table Temp สำหรับ Get ปีย้อนหลัง 3 ปี
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 -- id จาก query param
				ORDER BY id DESC
				LIMIT 3 -- ย้อนหลัง 3 
			), 
			repeat_area AS ( -- สร้าง Table Temp สำหรับ Get ข้อมูลการปลูกอ้อยซ้ำของแต่ละภูมิภาค
				SELECT 
					region_id,
					cls_round,
					cls_edate,
					SUM(area_m2) as area_m2,
					SUM(area_km2) as area_km2,
					SUM(area_rai) as area_rai,
					SUM(area_hexa) as area_hexa
				FROM sugarcane.sugarcane.sugarcane_ds_repeat_area 
				WHERE repeat = 3 -- การปลูกซ้ำ = 3
				GROUP BY region_id, cls_round, cls_edate
			)
			SELECT 
				yp.id AS year_id, -- id ของปี
				yp.name AS year_name, -- ชื่อของปีภาษาไทย
				yp.name_en AS year_name_en, -- ชื่อของปีภาษาอังกฤษ
				r.region_id, -- id ของภูมิภาค
				r.region_name, -- ชื่อของภูมิภาคภาษาไทย
				r.region_name_en, -- ชื่อของภูมิภาคภาษาอังกฤษ
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, -- Dto Out : provinces
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				COALESCE(100 * ra.area_m2 / NULLIF(SUM(sdra.area_m2), 0), 0) AS m2, -- คำนวนเปอเซ็นของตารางเมตร
				COALESCE(100 * ra.area_km2 / NULLIF(SUM(sdra.area_km2), 0), 0) AS km2, -- คำนวนเปอเซ็นของตารางกิโลเมตร
				COALESCE(100 * ra.area_rai / NULLIF(SUM(sdra.area_rai), 0), 0) AS rai, -- คำนวนเปอเซ็นของไร่
				COALESCE(100 * ra.area_hexa / NULLIF(SUM(sdra.area_hexa), 0), 0) AS hexa -- คำนวนเปอเซ็นของ Hexa
			FROM last_3_years yp -- Table temp
			CROSS JOIN sugarcane.sugarcane.regions r  -- join กับ ภูมิภาคเพื่อเอาภาคทั้งหมด
			left join sugarcane.sugarcane.provinces p on p.region_id = r.region_id
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_repeat_area sdra -- ่join กับ table ที่มี data ของพื้นที่
				ON sdra.region_id = r.region_id  -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND sdra.cls_round = yp.sugarcane_round 
				AND sdra.cls_edate BETWEEN 
					TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
			LEFT JOIN repeat_area ra  -- ่join กับ table temp ที่มี data ของพื้นที่การปลูกซ้ำ
				ON ra.region_id = r.region_id -- เงื่อนไขคือ ภูมิภาคเดียวกัน รอบเดียวกัน ช่วงปีเท่ากัน
				AND ra.cls_round = yp.sugarcane_round 
				AND ra.cls_edate BETWEEN 
					TO_TIMESTAMP(yp.sugarcane_year || '-01-01', 'YYYY-MM-DD') 
					AND TO_TIMESTAMP(yp.sugarcane_year || '-12-31', 'YYYY-MM-DD')
			where r.region_id < 5	
			GROUP BY yp.id, yp.name, yp.name_en, r.region_id, ra.area_m2, ra.area_km2 ,ra.area_rai,ra.area_hexa
			ORDER BY yp.id ASC, r.region_id; 
			`,
			[payload.id],
		)

		let data = []
		for (const item of queryResult) {
			let g = data.find((e) => e.regionId === item.region_id)
			if (!g) {
				g = {
					regionId: item.region_id,
					regionName: item.region_name,
					regionNameEn: item.region_name_en,
					provincesName: item.provinces,
					provincesEn: item.provinces_en,
				}
				g.years = []
				data.push(g)
			}

			const year = {
				yearId: item.year_id,
				yearName: item.year_name,
				yearNameEn: item.year_name_en,
				area: {
					m2: Number(item.m2),
					km2: Number(item.km2),
					rai: Number(item.rai),
					hexa: Number(item.hexa),
				},
			}

			g.years.push(year)
		}

		return new ResponseDto<GetReplantOverviewDtoOut[]>({ data })
	}
}
