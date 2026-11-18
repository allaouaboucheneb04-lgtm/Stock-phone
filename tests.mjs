import assert from 'node:assert/strict';
import {isValidImei,extractImeis,inventorySummary,validatePhoneDraft,csvEncode} from './core.mjs';
import { searchTacCsv, formatTacDevice } from './tac.mjs';
const good='490154203237518';
assert.equal(isValidImei(good),true,'Known valid IMEI');
assert.equal(isValidImei('490154203237519'),false,'Bad check digit');
assert.equal(isValidImei('49015420323751'),false,'Too few digits');
assert.deepEqual(extractImeis(`IMEI: ${good}; Serial: A-123`),[good]);
assert.deepEqual(extractImeis(`Barcode: 1234567890123`),[]);
const example={id:'abc',imei:good,imei2:'',brand:'Apple',model:'iPhone 15',status:'stock',purchasePrice:300,listPrice:550};
const found=validatePhoneDraft(example,[],null);assert.equal(found,'');
assert.match(validatePhoneDraft(example,[example],null),/existe déjà/);
assert.equal(validatePhoneDraft({...example,imei2:good},[],null).includes('différents'),true);
const summ=inventorySummary([example,{...example,id:'sold',status:'sold',salePrice:500,purchasePrice:300},{...example,id:'reserved',status:'reserve',purchasePrice:200,listPrice:400}]);
assert.equal(summ.stock,1);assert.equal(summ.reserved,1);assert.equal(summ.sold,1);assert.equal(summ.costValue,500);assert.equal(summ.realizedProfit,200);
assert.equal(csvEncode([['a;b','he said "hi"','x\ny']]),'"a;b";"he said ""hi""";"x\ny"');

const fixture='Brand,TAC,SPECS\nAPPLE,35001019,"APPLE IPHONE AIR, N/A, A3518, 2025"\nSAMSUNG,35000746,"SAMSUNG GALAXY S26 ULTRA, Samsung SC-53G2026"\n';
assert.deepEqual(searchTacCsv(fixture,'35001019'),{brand:'Apple',model:'iPhone Air',tac:'35001019'});
assert.deepEqual(searchTacCsv(fixture,'35000746'),{brand:'Samsung',model:'Galaxy S26 Ultra',tac:'35000746'});
assert.equal(searchTacCsv(fixture,'35000747'),null,'TAC absent');
assert.equal(searchTacCsv(fixture,'3500074'),null,'TAC invalide');
assert.equal(formatTacDevice('APPLE','N/A'),null,'Modèle inconnu');

console.log('OK — validation IMEI, gestion du stock et recherche TAC testées.');