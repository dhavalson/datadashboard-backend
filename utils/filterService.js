// services/filterService.js

const buildFilterQuery = (userFilters, initialParamIndex = 1) => {
    let { role, distributor_code, territory, zone } = userFilters;

    // Automatically bypass scoping filters if the user is an admin or employee
    if (role && (role.toLowerCase() === 'admin' || role.toLowerCase() === 'employee')) {
        distributor_code = null;
        territory = null;
        zone = null;
    }

    let whereClauses = [];
    let params = [];
    let paramIndex = initialParamIndex;

    if (distributor_code && distributor_code.trim() !== '') {
        whereClauses.push(`distributor_code = $${paramIndex++}`);
        params.push(distributor_code);
    } else if (territory && Array.isArray(territory) && territory.length > 0) {
        whereClauses.push(`territory = ANY($${paramIndex++})`);
        params.push(territory);
    } else if (territory && typeof territory === 'string' && territory.trim() !== '') {
        whereClauses.push(`territory = $${paramIndex++}`);
        params.push(territory.trim());
    } else if (zone && Array.isArray(zone) && zone.length > 0) {
        whereClauses.push(`zone = ANY($${paramIndex++})`);
        params.push(zone);
    } else if (zone && typeof zone === 'string' && zone.trim() !== '') {
        whereClauses.push(`zone = $${paramIndex++}`);
        params.push(zone.trim());
    }

    return {
        whereClause: whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '',
        params,
        nextParamIndex: paramIndex
    };
};

module.exports = { buildFilterQuery };