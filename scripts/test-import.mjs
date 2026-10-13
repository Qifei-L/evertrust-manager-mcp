import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import worker from '../worker/index.js';
const fixtureDir = mkdtempSync(join(tmpdir(), 'managerio-import-'));
process.on('exit', () => rmSync(fixtureDir, { recursive: true, force: true }));
const fixture = name => join(fixtureDir, name);
const python = process.env.PYTHON || 'python';
// Independent XML parser supplies a minimal DOM to exercise the browser's XLSX reader without a browser.
class XmlNode{constructor(n){this.n=n}getAttribute(k){return this.n.a[k]??null}get textContent(){return this.n.text}getElementsByTagName(tag){const out=[];function walk(n){for(const c of n.c){if(c.tag===tag)out.push(new XmlNode(c));walk(c)}}walk(this.n);return out}}
class DOMParser{parseFromString(input){const tree=JSON.parse(execFileSync(python,['-c',`import sys,json,xml.etree.ElementTree as E
r=E.fromstring(sys.stdin.read())
def node(x):
 return {'tag':x.tag.split('}')[-1],'a':{('r:id' if k.endswith('}id') else k):v for k,v in x.attrib.items()},'text':''.join(x.itertext()),'c':[node(c) for c in x]}
print(json.dumps({'tag':'document','a':{},'text':'','c':[node(r)]}))`],{input,encoding:'utf8'}));return new XmlNode(tree)}}
const response=await worker.fetch(new Request('https://test.local',{headers:{'oai-authenticated-user-id':'owner'}}),{});
const script=(await response.text()).match(/<script>([\s\S]*?)<\/script>/)[1],start=script.indexOf('function tableRows('),end=script.indexOf('let syncDraft=');
const {readExcel}=runInNewContext(script.slice(start,end)+';({readExcel})',{DOMParser,TextDecoder,DataView,Uint8Array,Blob,Response,DecompressionStream});
execFileSync(python,['-c',`from openpyxl import Workbook
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree
w=Workbook();w.active.title='Notes';w.active.append(['Notes']);s=w.create_sheet('COA');s.append(['Code','Name','Group','Report','Type']);s.append(['0010','Bank, foreign','Assets','BS','Account']);w.save(${JSON.stringify(fixture('coa-import-fixture.xlsx'))})
f=Workbook();s=f.active;s.append(['Code','Name']);s.append(['0100','=1+1']);f.save(${JSON.stringify(fixture('coa-import-formula.xlsx'))})
with ZipFile(${JSON.stringify(fixture('coa-import-formula.xlsx'))}) as z: files={n:z.read(n) for n in z.namelist()}
x=etree.fromstring(files['xl/worksheets/sheet1.xml']);ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};x.xpath('//s:c[@r="B2"]/s:v',namespaces=ns)[0].text='2';files['xl/worksheets/sheet1.xml']=etree.tostring(x)
with ZipFile(${JSON.stringify(fixture('coa-import-cached.xlsx'))},'w',ZIP_DEFLATED) as z:
 for n,b in files.items():z.writestr(n,b)
`]);
const file=async path=>new File([await readFile(path)],path.split('/').at(-1));
const rows=await readExcel(await file(fixture('coa-import-fixture.xlsx')));assert.equal(rows.length,1);assert.equal(rows[0].code,'0010');assert.equal(rows[0].name,'Bank, foreign');assert.equal(rows[0].type,'Account');
await assert.rejects(()=>readExcel(new File(['not excel'],'bad.xlsx')),/Invalid Excel/);
await assert.rejects(async()=>readExcel(await file(fixture('coa-import-formula.xlsx'))),/formula has no saved result/);
const cached=await readExcel(await file(fixture('coa-import-cached.xlsx')));assert.equal(cached[0].name,'2');
console.log('PASS: compressed XLSX import, preferred COA sheet, leading-zero codes, cached formula values and rejection of missing formula results or invalid ZIP.');
