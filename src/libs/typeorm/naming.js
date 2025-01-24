const { paramCase } = require('change-case')

module.exports.entityName = (old) => {
	if (old !== 'tb_req_status_mapping') {
		return paramCase(old) + '.entity'
	}
	return paramCase(old.replace('tb_', 'vw_')) + '.entity'
}
