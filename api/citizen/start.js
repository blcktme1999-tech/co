const { createSessionCookie, getJsonBody, getSupabase, json, methodNotAllowed, normalizeCaseNumber, publicCase } = require('../_lib/service');

async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST']);
    const client = getSupabase();
    const body = req.method === 'GET' ? req.query : await getJsonBody(req);
    const citizenName = String(body.citizenName || '').trim();
    const caseNumber = normalizeCaseNumber(body.caseNumber || body.nationalId);
    if (citizenName.length < 2 || caseNumber.length < 3) return json(res, 400, { error: '請輸入姓名與案號' });

    let found = await client.from('service_cases').select('*').eq('citizen_name', citizenName).eq('case_number', caseNumber).order('created_at', { ascending: false });
    if (found.error) throw found.error;
    let cases = found.data || [];
    let caseRow = cases[0] || null;
    if (!caseRow) return json(res, 404, { error: '查無資料' });
    if (caseRow.status !== 'open') return json(res, 403, { error: '案件尚未開通' });

    res.setHeader('Set-Cookie', createSessionCookie({ caseId: caseRow.id, citizenName, caseNumber }));
    json(res, 200, { status: 'open', case: publicCase(caseRow), cases: cases.map(publicCase) });
  } catch (error) {
    json(res, 500, { error: error.message || '申請開通失敗' });
  }
}

module.exports = handler;
