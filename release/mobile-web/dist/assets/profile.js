import { MealJournal as J } from './journal.js';

(()=>{
 try { J.seedStarter(); } catch { const toast=document.getElementById("toast");toast.textContent="示例记录未能加载，已有内容会保留。";toast.hidden=false; }

 const tasteAxes=[["清淡",/清淡|少油|不油|爽口|没负担/],["鲜甜",/鲜甜|清甜|鲜香|酸甜|偏甜|带一点甜/],["偏辣",/辣|麻辣|微辣/],["偏咸",/咸|重口/],["偏油",/油腻|偏油|很油/]];
 const radarSvg=values=>{
  const width=320,height=244,cx=160,cy=119,r=74,angles=values.map((_,i)=>-Math.PI/2+i*Math.PI*2/values.length);
  const point=(a,scale)=>`${(cx+Math.cos(a)*r*scale).toFixed(1)},${(cy+Math.sin(a)*r*scale).toFixed(1)}`;
  const grid=[.25,.5,.75,1].map(scale=>`<polygon points="${angles.map(a=>point(a,scale)).join(" ")}"/>`).join("");
  const axes=angles.map(a=>`<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}"/>`).join("");
  const max=Math.max(1,...values);const scales=values.map(v=>v?Math.max(.14,v/max):.06);
  const area=angles.map((a,i)=>point(a,scales[i])).join(" ");
  const dots=angles.map((a,i)=>`<circle cx="${(cx+Math.cos(a)*r*scales[i]).toFixed(1)}" cy="${(cy+Math.sin(a)*r*scales[i]).toFixed(1)}" r="3.5"/>`).join("");
  const labels=angles.map((a,i)=>{const x=cx+Math.cos(a)*102,y=cy+Math.sin(a)*99+3;const anchor=Math.cos(a)<-.25?"end":Math.cos(a)>.25?"start":"middle";return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${tasteAxes[i][0]}</text>`}).join("");
  return `<svg class="taste-radar" viewBox="0 0 ${width} ${height}" role="img" aria-label="口味画像雷达图。${tasteAxes.map((x,i)=>`${x[0]}${values[i]}次`).join("，")}"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-area" points="${area}"/>${dots}<g class="radar-labels">${labels}</g></svg>`;
 };
 const makeBars=(host,entries,emptyText)=>{if(!entries.length){host.innerHTML=`<div class="empty">${emptyText}</div>`;return}const max=Math.max(...entries.map(x=>x.count));host.innerHTML=entries.map(item=>`<div class="chart-row"><span class="chart-label">${J.escape(item.label)}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.max(8,Math.round(item.count/max*100))}%"></div></div><span class="chart-count">${item.count}</span></div>`).join("")};
 const periodOf=date=>{const m=date.getHours()*60+date.getMinutes();if(m>=360&&m<600)return"早餐";if(m>=600&&m<900)return"午餐";if(m>=900&&m<1020)return"下午茶";if(m>=1020&&m<1320)return"晚餐";return"夜宵"};
 const timeLabel=date=>`${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`;
 const render=()=>{const profileSettings=J.getSettings();document.getElementById("profileGreeting").textContent=profileSettings.nickname?`${profileSettings.nickname}，从每一餐看见自己的饮食习惯。`:"从每一餐看见自己的饮食习惯。";const logs=J.read().sort((a,b)=>new Date(b.loggedAt)-new Date(a.loggedAt));const dishes=new Map(),periods=new Map(),tasteCounts=tasteAxes.map(()=>0);
  logs.forEach(log=>{const parsed=J.analyze(log.text);const date=new Date(log.loggedAt||NaN);const period=Number.isNaN(date.getTime())?parsed.period:periodOf(date);if(!periods.has(period))periods.set(period,[]);if(!Number.isNaN(date.getTime()))periods.get(period).push(date);(log.dish_name?[log.dish_name]:parsed.items.length?parsed.items:log.dish?[log.dish]:[]).forEach(dish=>dishes.set(dish,(dishes.get(dish)||0)+1));tasteAxes.forEach(([label,re],index)=>{if(label==="鲜甜"?log.tags.some(tag=>["偏甜","鲜香"].includes(tag)):log.tags.includes(label))tasteCounts[index]++})});
  const samples=logs.filter(log=>log.source==="fictional-mixed-dining-sample").length;document.getElementById("sampleNotice").hidden=!samples;document.getElementById("sampleNotice").textContent=`含 ${samples} 餐虚构示例，仅供原型演示。`;document.getElementById("mealTotal").textContent=String(logs.length);const mealRows=["早餐","午餐","晚餐"].map(name=>{const dates=periods.get(name)||[];const minutes=dates.map(date=>date.getHours()*60+date.getMinutes()).sort((a,b)=>a-b);const clock=value=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;const range=minutes.length?(minutes.length>1&&minutes[0]!==minutes[minutes.length-1]?`${clock(minutes[0])}–${clock(minutes[minutes.length-1])}`:clock(minutes[0])):"暂无记录";return `<div class="meal-time-row"><span>${name}</span><strong>${range}</strong></div>`}).join("");document.getElementById("mealTimeRanges").innerHTML=mealRows;document.getElementById("foodKinds").textContent=`${dishes.size} 道菜`;
  const foodEntries=[...dishes.entries()].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,"zh-CN")).slice(0,5);
  makeBars(document.getElementById("foodChart"),foodEntries,"记录菜品后，这里会显示常吃菜品。");
  document.getElementById("tasteCount").textContent=logs.length?`基于 ${logs.length} 餐`:"";
  document.getElementById("tasteChart").innerHTML=logs.length?radarSvg(tasteCounts):'<div class="empty">在饮食记录中写下口味感受后，这里会逐渐形成画像。</div>';
 };
 document.getElementById("clearLogs").addEventListener("click",()=>{if(!J.read().length)return;if(!confirm("确定清空所有饮食记录吗？此操作无法撤销。清空后示例记录不会自动重新生成。"))return;try{J.write([]);localStorage.setItem(J.STARTER_KEY,"cleared-by-user");localStorage.setItem("meal_logs_starter_v3","cleared-by-user");localStorage.setItem("meal_logs_starter_v5","cleared-by-user");localStorage.setItem("meal_logs_starter_v6","cleared-by-user");localStorage.setItem("meal_logs_starter_v7","cleared-by-user");localStorage.setItem("meal_logs_starter_v8","cleared-by-user");localStorage.setItem("meal_logs_starter_v9","cleared-by-user");localStorage.setItem("meal_logs_starter_v10","cleared-by-user");localStorage.setItem("meal_logs_starter_v11","cleared-by-user");localStorage.setItem("meal_logs_starter_v12","cleared-by-user");localStorage.setItem("meal_logs_starter_v13","cleared-by-user");render()}catch{const box=document.getElementById("toast");box.textContent="未能清空记录，请重试。";box.hidden=false;setTimeout(()=>box.hidden=true,2200)}});
 window.addEventListener("storage",event=>{if(event.key===J.KEY||event.key===J.SETTINGS_KEY||event.key===null)render()});
 render();
})();
