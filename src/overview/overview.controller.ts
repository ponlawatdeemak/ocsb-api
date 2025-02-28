import { ResponseDto } from '@interface/config/app.config'
import { Controller, Get, Query, BadRequestException } from '@nestjs/common'
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
import { errorResponse } from '@interface/config/error.config'
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
		if (!payload.id) throw new BadRequestException(errorResponse.ID_NOTFOUND)
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const cntHotspot = await this.sugarcaneHotspotEntity.count({
			where: {
				acqDate: Between(new Date(yearLookupCondition.hotspotStart), new Date(yearLookupCondition.hotspotEnd)),
			},
		})
		const burnAreaQuery = await this.dataSource.query(
			`
			SELECT 
				COALESCE(SUM(sdba.area_m2), 0) AS m2,
				COALESCE(SUM(sdba.area_km2), 0) AS km2, 
				COALESCE(SUM(sdba.area_rai), 0) AS rai,
				COALESCE(SUM(sdba.area_hexa), 0) AS hexa
			FROM sugarcane.sugarcane.sugarcane_ds_burn_area_monthly sdba 
			WHERE TO_DATE(sdba.year || '-' || sdba.month || '-01', 'YYYY-MM-DD') BETWEEN DATE($1) AND DATE($2) 
			`,
			[new Date(yearLookupCondition.burnAreaStart), new Date(yearLookupCondition.burnAreaEnd)],
		)
		Object.keys(burnAreaQuery[0]).forEach((key) => {
			burnAreaQuery[0][key] = Number(burnAreaQuery[0][key])
		})
		const yieldPredQuery = await this.dataSource.query(
			`SELECT 
				SUM(sdyp.area_m2) AS m2, 
				SUM(sdyp.area_km2) AS km2, 
				SUM(sdyp.area_rai) AS rai, 
				SUM(sdyp.area_hexa) AS hexa, 
				SUM(sdyp.production_kg) AS kg, 
				SUM(sdyp.production_ton) AS ton
			FROM sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
			WHERE 
				sdyp.cls_round = $1 
				AND sdyp.cls_sdate::DATE BETWEEN 
					TO_DATE($2 || '-11-01', 'YYYY-MM-DD') 
					AND (DATE_TRUNC('MONTH', TO_DATE((CAST($2 AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
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
		if (!payload.id) throw new BadRequestException(errorResponse.ID_NOTFOUND)
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
		if (!payload.id) throw new BadRequestException(errorResponse.ID_NOTFOUND)
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const queryResult = await this.dataSource.query(
			`SELECT 
					r.region_id,
					r.region_name,
					r.region_name_en,
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces,
					ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en,
					COUNT(*) AS region_count, 
					COUNT(CASE WHEN sh.in_sugarcane = true THEN 1 END) AS in_sugarcane, 
					COUNT(CASE WHEN sh.in_sugarcane = false THEN 1 END) AS not_in_sugarcane 
				from sugarcane.sugarcane.regions r
				left join sugarcane.sugarcane.provinces p on r.region_id = p.region_id 
				left join sugarcane.sugarcane.sugarcane_hotspot sh on r.region_id = sh.region_id		
				where sh.acq_date 
					BETWEEN $1 and $2  and 
					r.region_id < 5
				GROUP BY r.region_id,r.region_name,r.region_name_en 
				ORDER BY r.region_id;
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
				SELECT generate_series(
					(SELECT DATE_TRUNC('month', yp.burn_area_start) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), 
					(SELECT DATE_TRUNC('month', yp.burn_area_end) FROM sugarcane.sugarcane.year_production yp WHERE yp.id = $1), 
					'1 month'
				)::date AS month
			),
			region_series AS (
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
				SELECT 
				    ms.month,
				    rs.region_id,
				    COALESCE(SUM(sdba.area_m2), 0) AS m2,
				    COALESCE(SUM(sdba.area_km2), 0) AS km2,
				    COALESCE(SUM(sdba.area_rai), 0) AS rai,
				    COALESCE(SUM(sdba.area_hexa), 0) AS hexa
				FROM month_series ms
				CROSS JOIN region_series rs
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_burn_area_monthly sdba
				    ON TO_DATE(sdba.year || '-' || sdba.month || '-01', 'YYYY-MM-DD') 
				       BETWEEN DATE(ms.month) AND (DATE_TRUNC('MONTH', ms.month) + INTERVAL '1 MONTH - 1 day')::DATE
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
		if (!payload.id) throw new BadRequestException(errorResponse.ID_NOTFOUND)
		const yearLookupCondition = await this.yearProductionEntity.findOne({ where: { id: Number(payload.id) } })
		const queryResult = await this.dataSource.query(
			`WITH total_area AS ( 
					SELECT 
						SUM(sdyp2.area_m2) AS m2, 
						SUM(sdyp2.area_rai) AS rai, 
						SUM(sdyp2.area_km2) AS km2, 
						SUM(sdyp2.area_hexa) AS hexa  
					FROM sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp2 
					JOIN sugarcane.sugarcane.year_production yp 
						ON yp.id = $2 
					WHERE sdyp2.cls_round = yp.sugarcane_round 
						AND sdyp2.cls_sdate::DATE BETWEEN 
						TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD') 
						AND (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
				)
				SELECT 
					r.region_id, 
					r.region_name,
					r.region_name_en,
					ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, 
					ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en,
					COALESCE(SUM(sdyp.area_m2), 0) AS m2, 
					COALESCE(SUM(sdyp.area_rai), 0) AS rai, 
					COALESCE(SUM(sdyp.area_km2), 0) AS km2, 
					COALESCE(SUM(sdyp.area_hexa), 0) AS hexa, 
					ROUND(COALESCE(SUM(sdyp.area_m2), 0)::numeric / (ta.m2::numeric) * 100, 2) AS m2_percent, 
					ROUND(COALESCE(SUM(sdyp.area_rai), 0)::numeric / (ta.rai::numeric) * 100, 2) AS rai_percent, 
					ROUND(COALESCE(SUM(sdyp.area_km2), 0)::numeric / (ta.km2::numeric) * 100, 2) AS km2_percent, 
					ROUND(COALESCE(SUM(sdyp.area_hexa), 0)::numeric / (ta.hexa::numeric) * 100, 2) AS hexa_percent
				FROM sugarcane.sugarcane.regions r 
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = $1
					AND DATE(sdyp.cls_sdate) BETWEEN (
						SELECT TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD')
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 
					) AND (
						SELECT (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $2 
					)
				LEFT JOIN sugarcane.sugarcane.provinces p 
					ON p.region_id = r.region_id
				LEFT JOIN total_area ta ON true  
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
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, 
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				(SUM(sdyp.yield_sum_kg_m2)/SUM(sdyp.yield_coun)) as yield_mean_kg_m2, 
				(SUM(sdyp.yield_sum_kg_km2)/SUM(sdyp.yield_coun)) as yield_mean_kg_km2, 
				(SUM(sdyp.yield_sum_kg_rai)/SUM(sdyp.yield_coun)) as yield_mean_kg_rai, 
				(SUM(sdyp.yield_sum_kg_hexa)/SUM(sdyp.yield_coun)) as yield_mean_kg_hexa, 
				(SUM(sdyp.yield_sum_ton_m2)/SUM(sdyp.yield_coun)) as yield_mean_ton_m2, 
				(SUM(sdyp.yield_sum_ton_km2)/SUM(sdyp.yield_coun)) as yield_mean_ton_km2, 
				(SUM(sdyp.yield_sum_ton_rai)/SUM(sdyp.yield_coun)) as yield_mean_ton_rai, 
				(SUM(sdyp.yield_sum_ton_hexa)/SUM(sdyp.yield_coun)) as yield_mean_ton_hexa 
				FROM sugarcane.sugarcane.regions r 
				LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
					ON sdyp.region_id = r.region_id
					AND sdyp.cls_round = ( 
						SELECT yp.sugarcane_round 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 
					)
					AND DATE(sdyp.cls_sdate) BETWEEN (
						SELECT TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD') 
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 
					) AND (
						SELECT (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
						FROM sugarcane.sugarcane.year_production yp 
						WHERE yp.id = $1 
					)
				LEFT JOIN sugarcane.sugarcane.provinces p 
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
			`WITH last_4_years AS ( 
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 
				ORDER BY id DESC
				LIMIT 4 
			)
			SELECT 
				yp.id as year_id, 
				yp.name as year_name, 
				yp.name_en as year_name_en, 
				r.region_id, 
				r.region_name, 
				r.region_name_en, 
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, 
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				COALESCE(SUM(sdyp.production_kg), 0) as production_kg, 
				COALESCE(SUM(sdyp.production_ton), 0) as production_ton 
			FROM last_4_years yp 
			CROSS JOIN sugarcane.sugarcane.regions r 
			left join sugarcane.sugarcane.provinces p on p.region_id = r.region_id
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_yield_pred sdyp 
				ON sdyp.region_id = r.region_id 
				AND sdyp.cls_round = yp.sugarcane_round 
				AND DATE(sdyp.cls_sdate) 
					BETWEEN TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD') 
					AND (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
			where r.region_id  < 5
			GROUP BY yp.id, yp.name, r.region_id, yp.name_en, sdyp.cls_sdate
			ORDER BY yp.id ASC, r.region_id; 
			`,
			[payload.id],
		)

		const groupedData = queryResult.reduce((acc, item) => {
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

		const data: GetProductPredictOverviewDtoOut[] = Object.values(groupedData)
		return new ResponseDto<GetProductPredictOverviewDtoOut[]>({ data })
	}

	@Get('replant')
	async getReplant(
		@Query() payload: GetProductPredictOverviewDtoIn,
	): Promise<ResponseDto<GetReplantOverviewDtoOut[]>> {
		const queryResult = await this.dataSource.query(
			`WITH last_3_years AS ( 
				SELECT * 
				FROM sugarcane.sugarcane.year_production
				WHERE id <= $1 
				ORDER BY id DESC
				LIMIT 3 
			), 
			repeat_area AS ( 
				SELECT 
					region_id,
					repeat,
					cls_sdate,
					SUM(area_m2) as area_m2,
					SUM(area_km2) as area_km2,
					SUM(area_rai) as area_rai,
					SUM(area_hexa) as area_hexa
				FROM sugarcane.sugarcane.sugarcane_ds_repeat_area 
				WHERE repeat = 3 
				GROUP BY region_id, repeat, cls_sdate
			)
			SELECT 
				yp.id AS year_id, 
				yp.name AS year_name, 
				yp.name_en AS year_name_en, 
				r.region_id, 
				r.region_name, 
				r.region_name_en, 
				ARRAY_AGG(DISTINCT p.province_name ORDER BY p.province_name) AS provinces, 
				ARRAY_AGG(DISTINCT p.province_name_en ORDER BY p.province_name_en) AS provinces_en, 
				COALESCE(100 * ra.area_m2 / NULLIF(SUM(sdra.area_m2), 0), 0) AS m2, 
				COALESCE(100 * ra.area_km2 / NULLIF(SUM(sdra.area_km2), 0), 0) AS km2, 
				COALESCE(100 * ra.area_rai / NULLIF(SUM(sdra.area_rai), 0), 0) AS rai, 
				COALESCE(100 * ra.area_hexa / NULLIF(SUM(sdra.area_hexa), 0), 0) AS hexa ,
				sdra.cls_sdate
			FROM last_3_years yp 
			CROSS JOIN sugarcane.sugarcane.regions r 
			left join sugarcane.sugarcane.provinces p on p.region_id = r.region_id
			LEFT JOIN sugarcane.sugarcane.sugarcane_ds_repeat_area sdra 
				ON sdra.region_id = r.region_id  
				AND sdra.cls_sdate BETWEEN 
					TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD') 
					AND (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
			LEFT JOIN repeat_area ra  
				ON ra.region_id = r.region_id 
				AND ra.cls_sdate BETWEEN 
					TO_DATE(yp.sugarcane_year || '-11-01', 'YYYY-MM-DD')  
					AND (DATE_TRUNC('MONTH', TO_DATE((CAST(yp.sugarcane_year AS INTEGER) + 1) || '-03-01', 'YYYY-MM-DD')) - INTERVAL '1 day')::DATE
			where r.region_id < 5
			GROUP BY yp.id, yp.name, yp.name_en, r.region_id, ra.area_m2, ra.area_km2 ,ra.area_rai,ra.area_hexa,sdra.cls_sdate
			ORDER BY yp.id ASC, r.region_id;  
			`,
			[payload.id],
		)

		const data = []
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
