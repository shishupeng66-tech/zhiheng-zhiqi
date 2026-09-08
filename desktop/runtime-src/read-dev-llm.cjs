const { createDecipheriv } = require('node:crypto');
const fs = require('fs');
const db = require('better-sqlite3')('D:/知衡智企/data/zhiheng_local.db', { readonly: true });
const masterKey = Buffer.from(fs.readFileSync('D:/知衡智企/data/.settings-master-key', 'utf8').trim(), 'hex');
function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const d = createDecipheriv('aes-256-gcm', masterKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
const prof = db.prepare("select id from provider_profiles where module='llm' limit 1").get();
const rows = db.prepare('select key,value,is_secret from provider_settings where profile_id=?').all(prof.id);
const cfg = {};
for (const r of rows) cfg[r.key] = r.is_secret ? decrypt(r.value) : r.value;
console.log(JSON.stringify({ baseUrl: cfg.base_url, model: cfg.model, apiKey: cfg.api_key }));
