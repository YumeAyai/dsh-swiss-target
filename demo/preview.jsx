import React from 'react'
import { createRoot } from 'react-dom/client'
const query = new URLSearchParams(location.search)
const language = query.get('lang') === 'en' ? 'en' : 'zh'
const dark = query.get('theme') === 'dark'
document.documentElement.lang = language
if (dark) document.documentElement.dataset.theme = 'dark'
const sample = ['CC(=O)OC1=CC=CC=C1C(=O)O', 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', '[Na+].[O-]C(=O)c1ccccc1O']
const targets = [
 ['Cyclooxygenase-1', 'PTGS1', 'P23219', 'CHEMBL221', 'Oxidoreductase', .756, 13, 2],
 ['Cyclooxygenase-2', 'PTGS2', 'P35354', 'CHEMBL230', 'Oxidoreductase', .684, 8, 4],
 ['Adenosine A2a receptor', 'ADORA2A', 'P29274', 'CHEMBL251', 'Family A GPCR', .621, 21, 12],
 ['Adenosine A1 receptor', 'ADORA1', 'P30542', 'CHEMBL226', 'Family A GPCR', .538, 17, 9],
 ['Carbonic anhydrase II', 'CA2', 'P00918', 'CHEMBL205', 'Lyase', .412, 5, 3],
]
const rows = targets.map((v, i) => ({ target:v[0],commonName:v[1],uniprotId:v[2],chemblId:v[3],targetClass:v[4],probability:v[5],knownActives3d:v[6],knownActives2d:v[7],inputSmiles:sample[i<2?0:i<4?1:2],submittedSmiles:i===4?'OC(=O)c1ccccc1O':sample[i<2?0:1],jobId:`demo-${i}` }))
window.__ModuleLoader__ = { load({factory}) {
 const plugin = factory(() => React)
 let dictionaries
 const ctx = {
 effect: fn => fn(),
 locale: { register: (_, value) => {dictionaries=value}, bind: () => key => dictionaries[language][key] ?? key },
 slots: { inject: (_, fn) => fn(), register: (_, Panel) => {
  createRoot(document.getElementById('panel')).render(<Panel sessionId="demo" t={key => dictionaries[language][key] ?? key} run={async () => {
   await new Promise(resolve => setTimeout(resolve, 900))
   if (query.get('state') === 'error') return {ok:false,error:{message:language==='zh'?'演示错误：服务暂不可用，请稍后重试。':'Demo error: service unavailable. Please try again.'}}
   return {ok:true,value:{result:{text:'__SWISS_RESULT__'+JSON.stringify({requested:3,succeeded:3,elapsedMs:18400,rows,csvPath:'swiss_target_results.csv',conversions:[{input:sample[2],submitted:'OC(=O)c1ccccc1O',note:language==='zh'?'去除钠离子并中和':'Sodium removed; neutralized'}],errors:[]})}}}
  }} />)
 } },
 }
 plugin.apply(ctx)
} }
const script = document.createElement('script')
script.src='../client.js'
document.head.appendChild(script)
document.getElementById('demo-label').textContent=language==='zh'?'界面演示 · 示例数据，不代表实际预测':'UI DEMO · ILLUSTRATIVE DATA, NOT LIVE PREDICTIONS'
