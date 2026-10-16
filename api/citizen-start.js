const { createSessionCookie, getSupabase, json, methodNotAllowed, normalizeCaseNumber, publicCase } = require('./_lib/service');

function getQuery(req) {
  const host = req.headers.host || 'localhost';
  return new URL(req.url || '/', `https://${host}`).searchParams;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  try {
    const client = getSupabase();
    const query = getQuery(req);
    const citizenName = String(query.get('citizenName') || '').trim();
    const caseNumber = normalizeCaseNumber(query.get('caseNumber') || query.get('nationalId'));
    if (citizenName.length < 2 || caseNumber.length < 3) return json(res, 400, { error: '請輸入姓名與案號' });

    const found = await client.from('service_cases').select('*').eq('citizen_name', citizenName).eq('case_number', caseNumber).order('created_at', { ascending: false });
    if (found.error) throw found.error;
    const cases = found.data || [];
    const caseRow = cases[0] || null;

    if (!caseRow) return json(res, 404, { error: '查無資料' });
    if (caseRow.status !== 'open') return json(res, 403, { error: '案件尚未開通' });

    res.setHeader('Set-Cookie', createSessionCookie({ caseId: caseRow.id, citizenName, caseNumber }));
    json(res, 200, { status: 'open', case: publicCase(caseRow), cases: cases.map(publicCase) });
  } catch (error) {
    json(res, 500, { error: error.message || '申請開通失敗' });
  }
};