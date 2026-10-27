import { MealJournal as J } from './journal.js?v=4.0.0';
import { summarizeMeals, summarizeTaste, tasteDisplayScale, TASTE_AXES } from './profile-stats.js?v=4.0.0';

(()=>{
 try { J.seedStarter(); } catch { const toast=document.getElementById("toast");toast.textContent="示例记录未能加载，已有内容会保留";toast.hidden=false; }

 const radarSvg=(stats,display)=>{
  const {rates,counts,mealCount}=stats;
  const {points:scales,limit}=display;
  const width=320,height=244,cx=160,cy=119,r=74,angles=scales.map((_,i)=>-Math.PI/2+i*Math.PI*2/scales.length);
  const point=(a,scale)=>`${(cx+Math.cos(a)*r*scale).toFixed(1)},${(cy+Math.sin(a)*r*scale).toFixed(1)}`;
  const grid=[.25,.5,.75,1].map(scale=>`<polygon points="${angles.map(a=>point(a,scale)).join(" ")}"/>`).join("");
  const axes=angles.map(a=>`<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}"/>`).join("");
  const area=angles.map((a,i)=>point(a,scales[i])).join(" ");
  const dots=angles.map((a,i)=>`<circle cx="${(cx+Math.cos(a)*r*scales[i]).toFixed(1)}" cy="${(cy+Math.sin(a)*r*scales[i]).toFixed(1)}" r="3.5"/>`).join("");
  const labels=angles.map((a,i)=>{const x=(cx+Math.cos(a)*102).toFixed(1),y=(cy+Math.sin(a)*99+3).toFixed(1);const anchor=Math.cos(a)<-.25?"end":Math.cos(a)>.25?"start":"middle";return `<text x="${x}" y="${y}" text-anchor="${anchor}">${TASTE_AXES[i].label}<tspan class="radar-value" x="${x}" dy="14">${Math.round(rates[i]*100)}%</tspan></text>`}).join("");
  return `<svg class="taste-radar" viewBox="0 0 ${width} ${height}" role="img" aria-label="口味标签占比，统一刻度0至${Math.round(limit*100)}%，基于${mealCount}餐，${TASTE_AXES.map((axis,i)=>`${axis.label}${counts[i]}餐，占${Math.round(rates[i]*100)}%`).join("，")}"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-area" points="${area}"/>${dots}<g class="radar-labels">${labels}</g></svg>`;
 };
 const makeBars=(host,entries,emptyText)=>{if(!entries.length){host.innerHTML=`<div class="empty">${emptyText}</div>`;return}const max=Math.max(...entries.map(x=>x.count));host.innerHTML=entries.map(item=>`<div class="chart-row"><span class="chart-label">${J.escape(item.label)}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.max(8,Math.round(item.count/max*100))}%"></div></div><span class="chart-count">${item.count}</span></div>`).join("")};
 const render=()=>{const logs=J.read();const remote=window.MealCloud?.state?.stats;const summary=remote?{...remote,dishCounts:new Map(Object.entries(remote.dishCounts))}:summarizeMeals(logs);const {mealCount,dayCount,dishCounts:dishes}=summary,tasteStats=remote?.taste||summarizeTaste(logs);
  document.getElementById("mealTotal").textContent=String(mealCount);document.getElementById("foodKinds").textContent=String(dishes.size);document.getElementById("recordDays").textContent=String(dayCount);
  const foodEntries=[...dishes.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"zh-CN")).slice(0,3);
  makeBars(document.getElementById("foodChart"),foodEntries,"记录菜品后，这里会显示常吃菜品");
  document.getElementById("tasteCount").textContent=logs.length?`基于 ${logs.length} 餐`:"";
  const tasteDisplay=tasteDisplayScale(tasteStats.rates);
  document.getElementById("tasteChart").innerHTML=tasteStats.taggedMealCount?radarSvg(tasteStats,tasteDisplay):'<div class="empty">还没有可统计的口味标签，记一顿时可以补充</div>';
 };
 window.addEventListener("storage",event=>{if(event.key===J.KEY||event.key===J.SETTINGS_KEY||event.key===null)render()});
 render();
})();
