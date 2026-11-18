// La liste publique est téléchargée une fois par session.
// Aucun IMEI complet n'est envoyé à un service externe.
const DATA_URL = 'https://cdn.jsdelivr.net/gh/MoazEb/tac-database@495795d7937d9a14c23fb1677c71f75baecb4e2f/tac_full.csv';
let catalogPromise;
const brands = {
  APPLE:'Apple', SAMSUNG:'Samsung', GOOGLE:'Google', XIAOMI:'Xiaomi',
  REDMI:'Redmi', POCO:'POCO', MOTOROLA:'Motorola', HUAWEI:'Huawei',
  HONOR:'Honor', OPPO:'OPPO', VIVO:'vivo', REALME:'realme',
  ONEPLUS:'OnePlus', NOKIA:'Nokia', TECNO:'Tecno', INFINIX:'Infinix',
  ITEL:'itel', TCL:'TCL', LG:'LG', SONY:'Sony', HTC:'HTC'
};
export function formatTacDevice(brandRaw, specsRaw) {
  const rawBrand = String(brandRaw || '').trim();
  let model = String(specsRaw || '').trim().replace(/^"/,'').split(',')[0].replace(/"$/,'').trim();
  if (!rawBrand || !model || /^(n\/a|unknown|not specified)$/i.test(model)) return null;
  if (model.toUpperCase().startsWith(rawBrand.toUpperCase() + ' ')) model = model.slice(rawBrand.length + 1);
  model = model.toLowerCase().replace(/\b[a-z]/g, s => s.toUpperCase());
  model = model.replace(/\bIphone\b/g,'iPhone').replace(/\bIpad\b/g,'iPad')
    .replace(/\b5g\b/gi,'5G').replace(/\b4g\b/gi,'4G')
    .replace(/\bSe\b/g,'SE').replace(/\bSm-/g,'SM-');
  if (!model) return null;
  const brand = brands[rawBrand.toUpperCase()] || rawBrand.toLowerCase().replace(/\b[a-z]/g,s=>s.toUpperCase());
  return {brand, model};
}
export function searchTacCsv(csv, tac) {
  if (!/^\d{8}$/.test(tac) || typeof csv !== 'string') return null;
  const needle = ',' + tac + ',';
  let index = csv.indexOf(needle);
  while (index !== -1) {
    const start = csv.lastIndexOf('\n', index) + 1;
    const endIndex = csv.indexOf('\n', index);
    const line = csv.slice(start, endIndex === -1 ? csv.length : endIndex).trim();
    const first = line.indexOf(',');
    const second = line.indexOf(',', first + 1);
    if (first !== -1 && second !== -1 && line.slice(first + 1, second).trim() === tac) {
      const match = formatTacDevice(line.slice(0, first), line.slice(second + 1));
      if (match) return {...match, tac};
    }
    index = csv.indexOf(needle, index + needle.length);
  }
  return null;
}
export async function lookupDeviceByImei(imei) {
  const tac = String(imei || '').slice(0, 8);
  if (!/^\d{8}$/.test(tac)) return null;
  if (!catalogPromise) {
    catalogPromise = fetch(DATA_URL)
      .then(response => {
        if (!response.ok) throw new Error('Base TAC indisponible (' + response.status + ').');
        return response.text();
      }).catch(error => { catalogPromise = null; throw error; });
  }
  return searchTacCsv(await catalogPromise, tac);
}
export const TAC_SOURCE = 'MoazEb/tac-database (données communautaires, octobre 2026)';
