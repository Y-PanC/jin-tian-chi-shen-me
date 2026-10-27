// Shared adapter for the original app and the supplied V7 journal pages.
// Reads preserve stored data; writes retain both schemas and extra fields.
export const MealJournal=(()=>{
 const KEY="meal_logs", STARTER_KEY="meal_logs_starter_v14", SETTINGS_KEY="user_settings";
 const cloud=()=>globalThis.MealCloud?.active?globalThis.MealCloud:null;
 const read=()=>{if(cloud())return cloud().state.records.map(normalize);try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v.filter(log=>log&&typeof log==="object"&&!Array.isArray(log)).map(normalize).filter(log=>log.text):[]}catch{return[]}};
 const write=logs=>{
  if(cloud())throw new Error("请通过餐食保存接口更新账号记录");
  try{const original=localStorage.getItem(KEY);if(original&&!Array.isArray(JSON.parse(original)))throw new Error("invalid");localStorage.setItem(KEY,JSON.stringify(logs.map(normalize)))}
  catch{throw new Error("饮食记录未能保存；请检查浏览器存储设置；已有记录和当前输入会保留")}
 };
 const defaultSettings=()=>({nickname:"",userId:"",phone:"",photoInputEnabled:true,voiceInputEnabled:true});
 const getSettings=()=>{if(cloud())return{...defaultSettings(),...cloud().state.settings};try{const value=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}");return{...defaultSettings(),...(value&&typeof value==="object"&&!Array.isArray(value)?value:{})}}catch{return defaultSettings()}};
 const saveSettings=settings=>cloud()?cloud().saveSettings(settings):localStorage.setItem(SETTINGS_KEY,JSON.stringify({...getSettings(),...settings}));
 const seedStarter=()=>{
  if(cloud())return;
  if(localStorage.getItem(STARTER_KEY)||localStorage.getItem(KEY)!==null)return;
  const legacy=["meal_logs_starter_v3","meal_logs_starter_v5","meal_logs_starter_v6","meal_logs_starter_v7","meal_logs_starter_v8","meal_logs_starter_v9","meal_logs_starter_v10","meal_logs_starter_v11","meal_logs_starter_v12","meal_logs_starter_v13"];
  if(legacy.some(key=>localStorage.getItem(key)==="cleared-by-user"))return;
  const samples=Array.isArray(window.MealJournalSeedV3)?window.MealJournalSeedV3:[];
  if(!samples.length)return;
  const now=new Date();
  write(samples.map(sample=>{const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-sample.daysAgo,sample.hour,sample.minute);return{...sample,loggedAt:date.toISOString(),inputMethod:sample.inputMethod||"text",source:"fictional-mixed-dining-sample"}}));
  localStorage.setItem(STARTER_KEY,"initialized");
 };
 const escape=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const normalize=log=>{
  const text=String(log.text||log.note||log.dish||log.dish_name||"").trim();
  const stamp=Date.parse(log.eatenAt||log.loggedAt||log.createdAt||log.timestamp||log.time||"");
  const date=Number.isFinite(stamp)?new Date(stamp).toISOString():null;
  const method=["text","photo","voice"].includes(log.inputMethod)?log.inputMethod:["text","photo","voice"].includes(log.source)?log.source:"text";
  const parsed=analyze(text,date);
  const dish=String(log.dish||log.dish_name||parsed.items.join("、")||text).slice(0,50);
  const tags=Array.isArray(log.tags)?log.tags.filter(tag=>typeof tag==="string"):parsed.tastes;
  return {...log,id:typeof log.id==="string"?log.id:`legacy-${text}-${date||"undated"}`,text,dish,tags:[...new Set(tags)],loggedAt:date,eatenAt:date,period:log.period||parsed.period,inputMethod:method,source:log.source||method};
 };
 const monthDay=value=>{if(!value)return"";const d=new Date(value);if(Number.isNaN(d.getTime()))return"";return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`};
 const mealPeriod=(text,value=new Date())=>{if(/早餐|早饭|早上/.test(text))return"早餐";if(/午餐|午饭|中餐|中午/.test(text))return"午餐";if(/晚餐|晚饭|晚上/.test(text))return"晚餐";if(/夜宵|宵夜/.test(text))return"夜宵";if(/下午茶|下午/.test(text))return"下午茶";if(!value)return null;const h=new Date(value).getHours();return Number.isNaN(h)?null:h>=6&&h<10?"早餐":h>=10&&h<15?"午餐":h>=15&&h<17?"下午茶":h>=17&&h<22?"晚餐":"夜宵"};
 const parseMealDate=text=>{
  const now=new Date();const match=String(text).match(/(?:^|[^0-9])(\d{1,2})[月/-](\d{1,2})(?:日)?/);
  let date=now;
  if(match){date=new Date(now.getFullYear(),Number(match[1])-1,Number(match[2]),now.getHours(),now.getMinutes());if(date.getMonth()!==Number(match[1])-1||date.getDate()!==Number(match[2]))throw new Error("日期不正确，请检查后再记录");}
  else if(/前天/.test(text))date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-2,now.getHours(),now.getMinutes());
  else if(/昨天|昨日/.test(text))date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1,now.getHours(),now.getMinutes());
  const clock=String(text).match(/(?:^|[^0-9])(\d{1,2})[:：](\d{2})(?![0-9])/);
  if(clock){if(+clock[1]>23||+clock[2]>59)throw new Error("时间不正确，请检查后再记录");date.setHours(+clock[1],+clock[2],0,0);}
  if(date.getTime()>now.getTime()+60000)throw new Error("用餐时间不能晚于现在，请检查日期");
  return date;
 };
 const dishTerms=["麻辣汤底自选碗","番茄汤底麻辣烫","番茄汤底自选碗","菌菇汤底麻辣烫","菌菇汤底自选碗","鸡腿堡／炸鸡套餐","黄焖鸡米饭","香菇黄焖鸡米饭","青椒黄焖鸡米饭","猪肉白菜水饺","桂林卤菜粉","牛腩桂林米粉","三鲜桂林米粉","鸡肉盖浇饭","咖喱鸡肉饭","照烧鸡腿饭","小锅牛肉饭","小锅豆腐菜饭","鸡蛋炒饭","小炒肉套餐","大众菜套餐","砂锅米线","风味面食套餐","自选称重餐","称重自选餐","自选荤素套餐","河西食堂自选菜","自选菜","盖浇饭","小炒肉","鸡肉锅仔","锅仔","黄焖鸡","麻辣烫","卤菜粉","牛腩粉","三鲜粉","馄饨","水饺","面点套餐","面条","炒饭","米粉","毛血旺","羊排萝卜汤","蛤蜊炖蛋","清炒茼蒿","椰子鸡","番茄炒蛋","宫保鸡丁","鱼香肉丝","红烧肉","糖醋里脊","炸鸡","披萨","酸辣粉","螺蛳粉"];
 const stapleTerms=["米饭","白饭","馒头","面包","白粥","粥","红茶","奶茶","咖啡","豆浆","饮料","青菜","白菜","米粉"];
 const extractFoods=text=>{
  const raw=String(text||"");
  const matched=dishTerms.filter(term=>raw.includes(term));
  if(matched.length)return [...new Set(matched)].filter(term=>!matched.some(other=>other!==term&&other.length>term.length&&other.includes(term)));
  const cleaned=raw.replace(/\d{1,2}[:：]\d{2}/g," ").replace(/\d{1,2}[月/-]\d{1,2}(?:日)?/g," ").replace(/早餐|早饭|午餐|午饭|中餐|中午|晚餐|晚饭|晚上|夜宵|宵夜|下午茶/g," ").replace(/.*?(?:吃了|吃|点了|点|喝了|喝)/," ").replace(/^(?:我|今天|刚才|记录)+/g," ");
  const fragments=cleaned.split(/[、，,；;。\n]+/).flatMap(part=>part.split(/(?:配|搭配|加了|加上)/));
  return [...new Set(fragments.map(part=>part.replace(/^[\s:：—-]+/,"").replace(/(?:口味|觉得|感觉|有点|比较|很|稍微|今天想|下次想).*/g,"").trim()).filter(part=>part.length>=2&&part.length<=12&&!stapleTerms.includes(part)&&!/(?:偏辣|偏咸|偏油|清淡|鲜甜|酸甜|酱香|卤香|口味|赶课|方便|下饭|家常|挺香|很香|好吃|开胃|顶饱|舒服|不错|还行|一般|有点|较为)/.test(part)))].slice(0,5);
 };
 const tasteTerms=[["清淡",/清淡|少油|不油|爽口|没负担/],["偏辣",/辣|麻辣|微辣/],["偏咸",/咸|重口/],["偏油",/油腻|偏油|很油/],["偏甜",/甜|鲜甜/],["偏酸",/酸/],["鲜香",/鲜|鲜香|很香/]];
 const analyze=(text,value=new Date())=>{
  const tastes=tasteTerms.filter(([,re])=>re.test(text)).map(([name])=>name);
  if(/不辣|没有辣|无辣/.test(text)){const index=tastes.indexOf("偏辣");if(index>=0)tastes.splice(index,1)}
  if(/不咸|少盐/.test(text)){const index=tastes.indexOf("偏咸");if(index>=0)tastes.splice(index,1)}
  return{items:extractFoods(text),tastes,period:mealPeriod(text,value)};
 };
 return{KEY,STARTER_KEY,SETTINGS_KEY,read,write,seedStarter,defaultSettings,getSettings,saveSettings,escape,normalize,monthDay,mealPeriod,parseMealDate,extractFoods,analyze};
})();
