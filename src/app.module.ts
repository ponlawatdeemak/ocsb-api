import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { LookupController } from './lookup/lookup.controller'
import { ProfileController } from './profile/profile.controller'
import { UMController } from './um/um.controller'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TypeOrmConfigService } from '@libs/typeorm'
import {
	PositionEntity,
	ProvincesEntity,
	RegionsEntity,
	RolesEntity,
	SugarcaneDsBurnAreaEntity,
	UsersEntity,
	YearProductionEntity,
} from '@interface/entities'
import { RandomService } from './core/random.service'
import { MailService } from './core/mail.service'
import { OverviewController } from './overview/overview.controller'
import { SugarcaneHotspotEntity } from '@interface/entities/sugarcane-hotspot.entity'

const imports = [
	ConfigModule.forRoot({ isGlobal: true }),
	TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
	TypeOrmModule.forFeature([
		UsersEntity,
		RolesEntity,
		PositionEntity,
		RegionsEntity,
		ProvincesEntity,
		YearProductionEntity,
		SugarcaneHotspotEntity,
		SugarcaneDsBurnAreaEntity,
	]),
	AuthModule,
]
@Module({
	imports: imports,
	controllers: [LookupController, OverviewController, ProfileController, UMController],
	providers: [RandomService, MailService],
})
export class AppModule {}
