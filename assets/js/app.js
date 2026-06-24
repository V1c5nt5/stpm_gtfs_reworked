
var VEHICLE_REGISTRY={};
async function loadVehicleRegistry(){
 try{ VEHICLE_REGISTRY=await (await fetch('https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/vehicle_registry.json',{cache:'no-store'})).json(); }catch(e){ VEHICLE_REGISTRY={};}
}
loadVehicleRegistry();
function vehicleInfoByPlate(plate){
 var k=String(plate||'').replace(/-/g,'').toUpperCase();
 return VEHICLE_REGISTRY[k]||null;
}
/* v2.2.3 public — lógica principal del Mapa Operativo RED
   Separado desde el HTML para facilitar mantenimiento en GitHub Pages. */

var SVC = {L:'Lunes a Viernes', S:'Sábado', D:'Domingo', F:'Festivo', LJ:'Lun a Jue', V:'Viernes'};
var DAY_NAMES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
var DATA = freshData();
var GITHUB_OWNER = 'V1c5nt5';
var GITHUB_REPO = 'stpm_gtfs';
var GITHUB_BRANCH = 'main';
var GITHUB_DATA_API = 'https://api.github.com/repos/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/contents/data?ref='+GITHUB_BRANCH;
var GITHUB_GTFS_FILES = [];
var GITHUB_DECO_FILES = [];
var GITHUB_PARAM_FILES = [];
var START_DATASET = null;
var REALTIME_DATASET = null;
var APP_MODE = 'static';
var GITHUB_CATALOG_LIVE = false;
var DATASET_MAX_GAP_DAYS = 6;
function freshData(){
  return {
    agency:{}, routes:{}, trips:{}, frequencies:[], frequenciesByTrip:{}, stopTimes:{}, stops:{}, stopIndex:{}, stopTrips:{}, shapes:{},
    calendar:{}, calendarDates:[], feedInfo:null, levels:{}, pathways:[], pathwaysByStop:{}, serviceIds:[], tripsByRoute:{}, tripsByService:{}, tripsByStop:{},
    decoRows:[], decoByRoute:{}, operators:[], sourceNames:{gtfs:'',deco:'',param:''}, sourceDates:{gtfs:null,deco:null,param:null},
    availableSources:{gtfs:false,deco:false,param:false}, decoCompatible:false, decoDateGapDays:null, analytics:null
  };
}
var freqChart = null, stopChart = null, overviewChart = null;
var leafMap = null, layerIda = null, layerReg = null, layerStops = null, routeMapBounds = null;
var BUS_ENDPOINTS = [
  'https://velocidades.seguimos.cl/?all-buses-data=1',
  'https://velocidades.seguimos.cl/?all-buses-data=2'
];
var BUS_OPERATOR_NAMES = {
  '2':'U2 - Su Bus',
  '4':'U4 - VOY Santiago SpA',
  '5':'U5 - Metropolitana',
  '16':'U3 - Vule',
  '32':'U8 - Alfa US1',
  '33':'U9 - Omega US2',
  '34':'U10 - STU US3',
  '35':'U11 - RBU US4',
  '36':'U12 - STU US5',
  '37':'U13 - RBU US6',
  '38':'U14 - VOY Santiago US14',
  '39':'U15 - VOY Santiago US15',
  '40':'U16 - Gran Americas US16',
  '41':'U18 - Conecta US18',
  '42':'U19 - Conecta US17'
};
var BUS_STATE = {
  features:[],
  direction:'all',
  loading:false,
  lastLoadedAt:null,
  sourceCount:0,
  sourceErrors:[],
  decoReady:false,
  decoIndex:null,
  visibleCount:0,
  catalogRoutes:0
};
var busLayer = null, busRefreshTimer = null, busRequestToken = 0;
var simMap = null, simShapeLayer = null, simVehicleLayer = null, simShapeKey = '';
var simSelectedMinute = 480;
var simAutoTimer = null;
var stopLeafMap = null, stopMarker = null;
var activeStop = null, selectedHour = 8;
var curMapDir = 0, curStopsDir = 0;
var _cachedArrivals = [];
var PARAMS = {
  file:null, zip:null, sheets:[], sharedStrings:null, cache:{}, activeSheet:null, rows:[], intervals:[], metric:'', sourceDate:null, loading:false
};


async function initGitHubGTFSList(){
  var fallbackGtfs=[
    {name:'GTFS_20260425_v3.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/GTFS_20260425_v3.zip'},
    {name:'GTFS_20260530.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/GTFS_20260530.zip'}
  ];
  var fallbackDeco=[
    {name:'DECO_VIGENTES_20260529.zip', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/DECO_VIGENTES_20260529.zip'}
  ];
  var fallbackParams=[
    {name:'15-Consolidado-Parametros-2026-05-30.xlsx', download_url:'https://raw.githubusercontent.com/V1c5nt5/stpm_gtfs/main/data/15-Consolidado-Parametros-2026-05-30.xlsx'}
  ];
  try{
    var res=await fetch(GITHUB_DATA_API,{cache:'no-store'});
    if(!res.ok) throw new Error('GitHub API '+res.status);
    var files=await res.json();
    var dataFiles=files.filter(function(f){return f.type==='file' && /\.(zip|csv|xlsx)$/i.test(f.name);})
      .map(function(f){return {name:f.name, download_url:f.download_url || ('https://raw.githubusercontent.com/'+GITHUB_OWNER+'/'+GITHUB_REPO+'/'+GITHUB_BRANCH+'/data/'+encodeURIComponent(f.name)), verified:true};})
      .sort(function(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true});});
    var zips=dataFiles.filter(function(f){return /\.(zip|csv)$/i.test(f.name);});
    GITHUB_GTFS_FILES=zips.filter(function(f){return /gtfs/i.test(f.name);});
    GITHUB_DECO_FILES=zips.filter(function(f){return /deco/i.test(f.name);});
    GITHUB_PARAM_FILES=dataFiles.filter(function(f){return /consolidado.*param/i.test(f.name) && /\.xlsx$/i.test(f.name);});
    if(!GITHUB_GTFS_FILES.length) GITHUB_GTFS_FILES=fallbackGtfs;
    if(!GITHUB_DECO_FILES.length) GITHUB_DECO_FILES=fallbackDeco;
    if(!GITHUB_PARAM_FILES.length) GITHUB_PARAM_FILES=fallbackParams;
    GITHUB_CATALOG_LIVE=true;
  }catch(err){
    console.warn('No se pudo leer /data desde GitHub. Se usará lista base.',err);
    GITHUB_CATALOG_LIVE=false;
    GITHUB_GTFS_FILES=fallbackGtfs;
    GITHUB_DECO_FILES=fallbackDeco;
    GITHUB_PARAM_FILES=fallbackParams;
  }
  fillGitHubSelects();
}
function fillOneSelect(id, files, placeholder, selectedIndex){
  var sel=document.getElementById(id); if(!sel) return;
  sel.innerHTML='';
  if(!files.length){
    var empty=document.createElement('option');
    empty.value='';
    empty.textContent=placeholder;
    sel.appendChild(empty);
    return;
  }
  files.forEach(function(f,i){
    var o=document.createElement('option');
    o.value=f.download_url;
    var itemDate=extractDateFromName(f.name);
    o.textContent=itemDate?formatDatasetDate(itemDate):'Fecha disponible';
    o.dataset.name=f.name;
    sel.appendChild(o);
    if(i===selectedIndex) o.selected=true;
  });
}
function dateKey(dt){
  if(!dt) return '';
  return String(dt.getFullYear())+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
}
function dateFromKey(key){
  var m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  var dt=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
  return isNaN(dt.getTime()) ? null : dt;
}
function formatDatasetDate(dt){
  if(!dt) return 'Fecha no detectada';
  try{
    return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric'}).format(dt);
  }catch(e){
    return String(dt.getDate()).padStart(2,'0')+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+dt.getFullYear();
  }
}
function fileWithDate(file){
  if(!file) return null;
  var dt=extractDateFromName(file.name);
  return dt ? {file:file,date:dt,key:dateKey(dt)} : null;
}
function datedFiles(files){
  return (files||[]).map(fileWithDate).filter(Boolean);
}
function newestNamedFile(items){
  return items.slice().sort(function(a,b){
    return String(a.file.name).localeCompare(String(b.file.name),undefined,{numeric:true});
  }).pop() || null;
}
function newestDatedFile(files){
  return datedFiles(files).sort(function(a,b){
    return a.date-b.date ||
      String(a.file.name).localeCompare(String(b.file.name),undefined,{numeric:true});
  }).pop() || null;
}
function launchAvailabilityCard(label,item){
  if(!item){
    return '<div class="availability-item missing"><span class="availability-label">'+esc(label)+'</span><strong>No disponible</strong><small>No se encontró información reciente.</small></div>';
  }
  return '<div class="availability-item available"><span class="availability-label">'+esc(label)+'</span><strong>Disponible</strong><small>'+esc(formatDatasetDate(item.date))+'</small></div>';
}
function setLaunchMode(mode){
  APP_MODE=mode==='realtime'?'realtime':'static';
  var staticButton=document.getElementById('launch-mode-static');
  var realtimeButton=document.getElementById('launch-mode-realtime');
  var staticOptions=document.getElementById('static-launch-options');
  var realtimeOptions=document.getElementById('realtime-launch-options');
  if(staticButton){
    staticButton.classList.toggle('active',APP_MODE==='static');
    staticButton.setAttribute('aria-checked',APP_MODE==='static'?'true':'false');
  }
  if(realtimeButton){
    realtimeButton.classList.toggle('active',APP_MODE==='realtime');
    realtimeButton.setAttribute('aria-checked',APP_MODE==='realtime'?'true':'false');
  }
  if(staticOptions) staticOptions.hidden=APP_MODE!=='static';
  if(realtimeOptions) realtimeOptions.hidden=APP_MODE!=='realtime';
  if(APP_MODE==='realtime') updateRealtimeAvailability();
  else updateStartDatasetAvailability();
}
function updateRealtimeAvailability(){
  var wrap=document.getElementById('realtime-dataset-availability');
  var note=document.getElementById('realtime-dataset-note');
  var btn=document.getElementById('btn-load-dataset');
  var label=document.getElementById('btn-load-dataset-label');
  var verifiedGtfs=GITHUB_GTFS_FILES.filter(function(file){return file.verified===true;});
  var verifiedDeco=GITHUB_DECO_FILES.filter(function(file){return file.verified===true;});
  var vigenteDeco=verifiedDeco.filter(function(file){return /deco.*vigent|vigent.*deco/i.test(file.name);});
  var gtfsItem=newestDatedFile(verifiedGtfs);
  var decoItem=newestDatedFile(vigenteDeco.length?vigenteDeco:verifiedDeco);
  REALTIME_DATASET={gtfs:gtfsItem,deco:decoItem};

  if(label && APP_MODE==='realtime') label.textContent='Abrir buses en tiempo real';
  if(!wrap || !note || !btn) return;

  wrap.innerHTML=launchAvailabilityCard('Buses y operadores',decoItem)+launchAvailabilityCard('Recorridos y trazados',gtfsItem);
  if(!GITHUB_CATALOG_LIVE){
    note.textContent='No se pudo verificar la información más reciente. Intenta nuevamente más tarde.';
    note.className='dataset-link-note is-warning';
    if(APP_MODE==='realtime') btn.disabled=true;
    return;
  }
  if(!decoItem || !gtfsItem){
    note.textContent='No se encontró toda la información necesaria para mostrar los buses en tiempo real.';
    note.className='dataset-link-note is-warning';
    if(APP_MODE==='realtime') btn.disabled=true;
    return;
  }
  note.textContent='La información más reciente se selecciona automáticamente.';
  note.className='dataset-link-note is-ready';
  if(APP_MODE==='realtime') btn.disabled=false;
}
function loadSelectedLaunchMode(){
  if(APP_MODE==='realtime') loadLatestRealtime();
  else loadSelectedMainGTFS();
}
function linkedDatasetForDate(targetDate){
  var targetKey=dateKey(targetDate);
  var gtfsExact=datedFiles(GITHUB_GTFS_FILES).filter(function(item){return item.key===targetKey;});
  var gtfsItem=newestNamedFile(gtfsExact);
  if(!gtfsItem) return {date:targetDate,gtfs:null,deco:null,param:null,complete:false,availableCount:0};

  function nearestWithinWindow(files){
    return datedFiles(files).filter(function(item){
      return dateGapDays(targetDate,item.date)<=DATASET_MAX_GAP_DAYS;
    }).sort(function(a,b){
      return dateGapDays(targetDate,a.date)-dateGapDays(targetDate,b.date) ||
        String(b.file.name).localeCompare(String(a.file.name),undefined,{numeric:true});
    })[0] || null;
  }

  var decoItem=nearestWithinWindow(GITHUB_DECO_FILES);
  var paramItem=nearestWithinWindow(GITHUB_PARAM_FILES);
  return {
    date:targetDate,
    gtfs:gtfsItem,
    deco:decoItem,
    param:paramItem,
    complete:!!(decoItem && paramItem),
    availableCount:1+(decoItem?1:0)+(paramItem?1:0)
  };
}
function availabilityDetail(item, targetDate){
  if(!item) return 'No disponible para esta fecha';
  var gap=dateGapDays(targetDate,item.date);
  var relation=gap===0 ? 'misma fecha' : (gap===1 ? '1 día de diferencia' : gap+' días de diferencia');
  return relation;
}
function availabilityCard(label,item,targetDate){
  var available=!!item;
  return '<div class="availability-item '+(available?'available':'missing')+'">'+
    '<span class="availability-label">'+esc(label)+'</span>'+
    '<strong>'+(available?'Disponible':'No disponible')+'</strong>'+
    '<small>'+availabilityDetail(item,targetDate)+'</small>'+
  '</div>';
}
function fillStartDateSelect(){
  var sel=document.getElementById('dataset-date-select');
  if(!sel) return;
  var old=sel.value;
  var groups={};
  datedFiles(GITHUB_GTFS_FILES).forEach(function(item){groups[item.key]=item.date;});
  var keys=Object.keys(groups).sort();
  sel.innerHTML='';
  if(!keys.length){
    var empty=document.createElement('option');
    empty.value='';
    empty.textContent='No hay fechas disponibles';
    sel.appendChild(empty);
    START_DATASET=null;
    updateStartDatasetAvailability();
    return;
  }
  keys.forEach(function(key){
    var o=document.createElement('option');
    o.value=key;
    o.textContent=formatDatasetDate(groups[key]);
    sel.appendChild(o);
  });
  sel.value=keys.indexOf(old)!==-1 ? old : keys[keys.length-1];
  updateStartDatasetAvailability();
}
function updateStartDatasetAvailability(){
  var sel=document.getElementById('dataset-date-select');
  var wrap=document.getElementById('dataset-availability');
  var note=document.getElementById('dataset-link-note');
  var btn=document.getElementById('btn-load-dataset');
  var buttonLabel=document.getElementById('btn-load-dataset-label');
  var targetDate=sel ? dateFromKey(sel.value) : null;
  START_DATASET=targetDate ? linkedDatasetForDate(targetDate) : null;

  if(!wrap || !note || !btn) return;
  if(buttonLabel && APP_MODE==='static') buttonLabel.textContent='Abrir recorridos y horarios';
  if(!START_DATASET || !START_DATASET.gtfs){
    wrap.innerHTML='<div class="availability-empty">No hay información disponible para esta fecha.</div>';
    note.textContent='No hay datos base disponibles para cargar.';
    note.className='dataset-link-note is-warning';
    if(APP_MODE==='static') btn.disabled=true;
    return;
  }

  wrap.innerHTML=
    availabilityCard('Recorridos y horarios',START_DATASET.gtfs,targetDate)+
    availabilityCard('Operadores y servicios',START_DATASET.deco,targetDate)+
    availabilityCard('Indicadores',START_DATASET.param,targetDate);

  var missing=[];
  if(!START_DATASET.deco) missing.push('operadores y servicios');
  if(!START_DATASET.param) missing.push('indicadores');
  if(!missing.length){
    note.textContent='Toda la información de esta fecha está disponible.';
    note.className='dataset-link-note is-ready';
  }else{
    note.textContent='Hay información parcial. No se encontraron '+missing.join(' ni ')+'.';
    note.className='dataset-link-note is-warning';
  }
  if(APP_MODE==='static') btn.disabled=false;
}
function fillGitHubSelects(){
  fillOneSelect('compare-base-select',GITHUB_GTFS_FILES,'Sin fechas disponibles',0);
  fillOneSelect('compare-target-select',GITHUB_GTFS_FILES,'Sin fechas disponibles',Math.max(0,GITHUB_GTFS_FILES.length-1));
  fillOneSelect('param-file-select',GITHUB_PARAM_FILES,'Sin indicadores disponibles',Math.max(0,GITHUB_PARAM_FILES.length-1));
  fillStartDateSelect();
  updateRealtimeAvailability();
}
function syncParamSelects(source){
  var tab=document.getElementById('param-file-select');
  if(!tab) return;
  if(source==='start'){
    if(START_DATASET && START_DATASET.param){
      tab.value=START_DATASET.param.file.download_url;
      tab.disabled=false;
    }else{
      tab.value='';
      tab.disabled=true;
    }
  }
}
async function fetchGTFSFileFromURL(url, name){
  var res=await fetch(url,{cache:'no-store'});
  if(!res.ok) throw new Error('No se pudo descargar '+name+' ('+res.status+')');
  var blob=await res.blob();
  try{ return new File([blob], name, {type:'application/zip'}); }
  catch(e){ blob.name=name; return blob; }
}
async function loadSelectedMainGTFS(){
  APP_MODE='static';
  if(!START_DATASET || !START_DATASET.gtfs){
    alert('No hay información disponible para la fecha seleccionada.');
    return;
  }
  var gtfs=START_DATASET.gtfs.file;
  var deco=START_DATASET.deco ? START_DATASET.deco.file : null;
  var paramItem=START_DATASET.param || null;
  syncParamSelects('start');
  prog(3,deco ? 'Cargando recorridos y operadores…' : 'Cargando recorridos…');
  try{
    var file=await fetchGTFSFileFromURL(gtfs.download_url,gtfs.name);
    var decoFile=null;
    if(deco){
      try{
        decoFile=await fetchGTFSFileFromURL(deco.download_url,deco.name);
      }catch(decoErr){
        console.warn('No se pudo descargar la información de operadores. Se continuará con los recorridos.',decoErr);
      }
    }
    await handleFile(file,decoFile,paramItem,'static');
  }
  catch(err){
    console.error(err);
    prog(0,'No se pudo cargar la información seleccionada.');
  }
}
async function loadLatestRealtime(){
  APP_MODE='realtime';
  updateRealtimeAvailability();
  if(!GITHUB_CATALOG_LIVE || !REALTIME_DATASET || !REALTIME_DATASET.deco || !REALTIME_DATASET.gtfs){
    alert('No se pudo verificar la información más reciente. Intenta nuevamente más tarde.');
    return;
  }
  var deco=REALTIME_DATASET.deco.file;
  var gtfs=REALTIME_DATASET.gtfs.file;
  prog(3,'Cargando la información más reciente…');
  try{
    var files=await Promise.all([
      fetchGTFSFileFromURL(gtfs.download_url,gtfs.name),
      fetchGTFSFileFromURL(deco.download_url,deco.name)
    ]);
    await handleFile(files[0],files[1],null,'realtime');
  }catch(err){
    console.error(err);
    prog(0,'No se pudo cargar la información más reciente.');
    alert('No se pudo cargar la información más reciente. El monitoreo no mostrará datos antiguos.');
  }
}
document.addEventListener('DOMContentLoaded', initGitHubGTFSList);

function prog(pct, txt){
  document.getElementById('prog-bar').style.display = 'block';
  document.getElementById('prog-fill').style.width = pct + '%';
  document.getElementById('prog-label').textContent = txt;
}
function csvNum(v, fallback){
  if(v===undefined||v===null||v==='') return fallback===undefined?0:fallback;
  var n = Number(v); return isNaN(n) ? (fallback===undefined?0:fallback) : n;
}
function timeToSecs(t){
  if(!t) return 0;
  var p = String(t).split(':');
  return csvNum(p[0])*3600 + csvNum(p[1])*60 + csvNum(p[2]);
}
function secsToTime(s){
  if(s===null||s===undefined||isNaN(s)) return '—';
  var sign=Number(s)<0?'-':'';
  var value=Math.abs(Number(s));
  var h=Math.floor(value/3600);
  var m=Math.floor((value%3600)/60);
  return sign+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
}
function cleanName(n){ return (n||'').replace(/^[A-Z0-9]+-/, '').trim(); }
function freqClass(m){ return m<=12?'fg-good':m<=20?'fg-mid':'fg-low'; }
function safeHexColor(value, fallback){
  value = String(value || '').replace('#','').trim();
  return /^[0-9a-fA-F]{6}$/.test(value) ? '#' + value : fallback;
}
function rColor(r){ return safeHexColor(r && r.route_color, '#AF2B1E'); }
function rText(r){ return safeHexColor(r && r.route_text_color, '#FFFFFF'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function unique(arr){ return Array.from(new Set(arr.filter(function(x){return x!==undefined&&x!==null&&x!=='';}))); }

function extractDateFromName(name){
  var value=String(name||'');
  var m=value.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)/);
  var y,mo,d;
  if(m){
    y=Number(m[1]); mo=Number(m[2])-1; d=Number(m[3]);
  }else{
    m=value.match(/([0-3]\d)[-_]([01]\d)[-_](20\d{2})/);
    if(!m) return null;
    d=Number(m[1]); mo=Number(m[2])-1; y=Number(m[3]);
  }
  var dt=new Date(y,mo,d);
  if(isNaN(dt.getTime()) || dt.getFullYear()!==y || dt.getMonth()!==mo || dt.getDate()!==d) return null;
  return dt;
}
function daysAgo(dt){
  if(!dt) return null;
  var now=new Date(), a=new Date(now.getFullYear(),now.getMonth(),now.getDate()), b=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
  return Math.floor((a-b)/86400000);
}
function ageText(label, dt){
  var d=daysAgo(dt); if(d===null) return label+': fecha no disponible';
  if(d===0) return label+': datos de hoy';
  if(d===1) return label+': datos de hace 1 día';
  return label+': datos de hace '+d+' días';
}
function dateGapDays(a, b){
  if(!a || !b) return null;
  var aDay=Date.UTC(a.getFullYear(),a.getMonth(),a.getDate());
  var bDay=Date.UTC(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round(Math.abs(aDay-bDay)/86400000);
}
function updateDecoCompatibility(){
  var gap=dateGapDays(DATA.sourceDates.gtfs,DATA.sourceDates.deco);
  DATA.decoDateGapDays=gap;
  DATA.decoCompatible=gap!==null && gap<=6;
}
function normalizeOpKey(v){ return String(v||'').trim().toLowerCase().replace(/\s+/g,''); }
function operatorFromDeco(row){ return row ? String(row.CLI_DSC||row.OPERADOR||row.operador||'Operador no informado').trim() : 'Operador no informado'; }
function routeOperator(route){
  if(!DATA.decoCompatible) return 'No disponible';
  if(!route) return 'Operador no informado';
  var keys=[route.route_short_name, route.route_id].map(normalizeOpKey);
  for(var i=0;i<keys.length;i++){ if(DATA.decoByRoute[keys[i]]) return operatorFromDeco(DATA.decoByRoute[keys[i]][0]); }
  return 'Operador no informado';
}
function routeMatchesOperator(route, op){
  if(!DATA.decoCompatible) return true;
  return !op || op==='__all' || routeOperator(route)===op;
}
function fillOperatorSelect(selId, keepValue){
  var sel=document.getElementById(selId); if(!sel) return;
  var old=keepValue || sel.value || '__all'; sel.innerHTML='';
  var all=document.createElement('option'); all.value='__all';
  if(!DATA.decoCompatible){
    all.textContent='Sin filtro por operador';
    sel.appendChild(all);
    sel.value='__all';
    sel.disabled=true;
    sel.title=DATA.availableSources.deco
      ? 'La información de operadores no corresponde a la fecha seleccionada.'
      : 'No hay información de operadores para esta fecha.';
    return;
  }
  all.textContent='Todos los operadores'; sel.appendChild(all);
  DATA.operators.forEach(function(op){ var o=document.createElement('option'); o.value=op; o.textContent=op; sel.appendChild(o); });
  sel.value=DATA.operators.indexOf(old)!==-1 ? old : '__all';
  sel.disabled=false;
  sel.removeAttribute('title');
}
function refreshDataAge(){
  var el=document.getElementById('data-age');
  var decoText=DATA.decoCompatible
    ? ageText('Operadores',DATA.sourceDates.deco)
    : (DATA.availableSources.deco ? 'Operadores: fecha distinta' : 'Operadores: no disponibles');
  if(el) el.textContent=ageText('Horarios',DATA.sourceDates.gtfs)+' · '+decoText;
  var side=document.getElementById('sidebar-source-summary');
  if(side){
    var gtfsDate=DATA.sourceDates.gtfs?formatDatasetDate(DATA.sourceDates.gtfs):'fecha no disponible';
    var available=['Recorridos'];
    if(DATA.availableSources.deco) available.push('Operadores');
    if(DATA.availableSources.param) available.push('Indicadores');
    side.innerHTML='<strong>'+esc(gtfsDate)+'</strong><br><span>'+esc(available.join(' · '))+'</span>';
  }
}
function sortServices(a,b){
  var order = {L:1,LJ:2,V:3,S:4,D:5,F:6};
  return (order[a]||99)-(order[b]||99) || String(a).localeCompare(String(b),undefined,{numeric:true});
}
function serviceLabel(sid){
  if(SVC[sid]) return SVC[sid];
  var c = DATA.calendar[sid];
  if(c){
    var flags = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(k){return String(c[k])==='1'||c[k]===1;});
    var active = flags.map(function(v,i){return v?DAY_NAMES[i]:null;}).filter(Boolean);
    if(active.length===5 && flags.slice(0,5).every(Boolean) && !flags[5] && !flags[6]) return 'Lunes a Viernes';
    if(active.length===7) return 'Todos los días';
    if(active.length) return active.join(', ');
  }
  return sid;
}
function tripDir(t){ return String(t.direction_id==null||t.direction_id===''?0:t.direction_id); }
function dirName(dir){ return String(dir)==='1'?'Regreso':'Ida'; }
function busCountText(count){ count=Number(count)||0; return count+' '+(count===1?'bus':'buses'); }
function getTripStartOffset(tripId){
  var st = DATA.stopTimes[tripId]||[];
  if(!st.length) return 0;
  return timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
}
function getStopOffsetInTrip(tripId, stopTimeRow){
  return timeToSecs(stopTimeRow.departure_time||stopTimeRow.arrival_time||'0:00:00') - getTripStartOffset(tripId);
}


async function parseDECOFile(file){
  var txt='';
  if(/\.zip$/i.test(file.name||'')){
    var zip=await JSZip.loadAsync(file);
    var names=Object.keys(zip.files).filter(function(n){return /\.csv$/i.test(n);});
    if(!names.length) throw new Error('El archivo de operadores no contiene datos válidos.');
    txt=await zip.file(names[0]).async('string');
  } else {
    txt=await file.text();
  }
  var rows=Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false,delimiter:';'}).data;
  DATA.decoRows=rows.filter(function(r){return r && (r.CODIGO_USUARIO||r.CODIGO_MTT||r.SERVICIO_DECO||r.CODIGO_RUTA);});
  DATA.decoByRoute={};
  DATA.decoRows.forEach(function(r){
    [r.CODIGO_USUARIO,r.CODIGO_MTT,r.SERVICIO_DECO].forEach(function(k){
      var key=normalizeOpKey(k); if(!key) return;
      if(!DATA.decoByRoute[key]) DATA.decoByRoute[key]=[];
      DATA.decoByRoute[key].push(r);
    });
  });
  DATA.operators=unique(DATA.decoRows.map(operatorFromDeco)).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  BUS_STATE.decoReady=false;
  BUS_STATE.decoIndex=null;
}

function parseGTFSInWorker(file){
  return new Promise(function(resolve, reject){
    if(!window.Worker){
      reject(new Error('Este navegador no puede procesar la información. Prueba con una versión reciente.'));
      return;
    }
    var worker = new Worker(new URL('assets/js/gtfs-worker.js', window.location.href));
    var done=false;
    worker.onmessage=function(e){
      var msg=e.data||{};
      if(msg.type==='progress') prog(msg.pct||0, msg.text||'Procesando...');
      if(msg.type==='done'){
        done=true;
        worker.terminate();
        resolve(msg.data);
      }
      if(msg.type==='error'){
        done=true;
        worker.terminate();
        reject(new Error(msg.message||'No se pudo leer la información de recorridos.'));
      }
    };
    worker.onerror=function(err){
      if(done) return;
      worker.terminate();
      reject(new Error(err.message||'No se pudo procesar la información de recorridos.'));
    };
    worker.postMessage({file:file});
  });
}

async function handleFile(file, decoFile, paramItem, mode){
  if(!file) return;
  APP_MODE=mode==='realtime'?'realtime':'static';
  DATA = freshData();
  BUS_STATE.decoReady=false;
  BUS_STATE.decoIndex=null;
  BUS_STATE.features=[];
  BUS_STATE.lastLoadedAt=null;
  DATA.availableSources.gtfs=true;
  DATA.availableSources.deco=!!decoFile;
  DATA.availableSources.param=!!(paramItem && paramItem.file);
  DATA.sourceNames.gtfs=file.name||'gtfs.zip';
  DATA.sourceNames.deco=decoFile ? (decoFile.name||'deco') : '';
  DATA.sourceNames.param=DATA.availableSources.param ? paramItem.file.name : '';
  DATA.sourceDates.gtfs=extractDateFromName(DATA.sourceNames.gtfs);
  DATA.sourceDates.deco=decoFile ? extractDateFromName(DATA.sourceNames.deco) : null;
  DATA.sourceDates.param=DATA.availableSources.param ? paramItem.date : null;
  updateDecoCompatibility();
  try{
    if(decoFile){
      prog(5,'Cargando operadores…');
      try{
        await parseDECOFile(decoFile);
      }catch(decoErr){
        console.warn('No se pudo procesar la información de operadores. Se continuará con los recorridos.',decoErr);
        DATA.decoRows=[];
        DATA.decoByRoute={};
        DATA.operators=[];
        DATA.availableSources.deco=false;
        DATA.sourceNames.deco='';
        DATA.sourceDates.deco=null;
        updateDecoCompatibility();
      }
    }
    prog(8,'Preparando recorridos y horarios…');
    var parsed=await parseGTFSInWorker(file);
    Object.keys(parsed).forEach(function(k){DATA[k]=parsed[k];});
    prog(100,'Datos listos');
    setTimeout(function(){
      document.getElementById('upload-section').style.display='none';
      document.getElementById('app').style.display='block';
      document.getElementById('btn-reload').style.display='inline-flex';
      buildUI();
      initMap();
      if(APP_MODE==='realtime') switchTab('buses');
      else{
        renderMap();
        switchTab('resumen');
      }
    },120);
  }catch(err){
    console.error(err);
    prog(0,err.message||'No se pudo cargar la información.');
    alert(err.message||'No se pudo cargar la información.');
  }
}

function tabAvailability(){
  var gtfs=!!(DATA.availableSources && DATA.availableSources.gtfs);
  var params=!!(DATA.availableSources && DATA.availableSources.param);
  return {
    resumen:gtfs,
    buses:APP_MODE==='realtime' && !!(DATA.availableSources && DATA.availableSources.deco),
    ruta:gtfs,
    paradero:gtfs,
    parametros:params,
    simulacion:gtfs,
    comparar:gtfs && APP_MODE==='static'
  };
}
function configureAvailableTabs(){
  var available=tabAvailability();
  document.querySelectorAll('.tab-btn[data-tab]').forEach(function(button){
    var tab=button.getAttribute('data-tab');
    var enabled=!!available[tab];
    button.style.display=enabled?'':'none';
    button.setAttribute('aria-hidden',enabled?'false':'true');
  });
  Object.keys(available).forEach(function(tab){
    var panel=document.getElementById('tab-'+tab);
    if(panel && !available[tab]) panel.style.display='none';
  });
  var preferred=APP_MODE==='realtime'
    ? ['buses','ruta','resumen','paradero','simulacion','comparar','parametros']
    : ['resumen','ruta','paradero','parametros','simulacion','comparar'];
  var first=preferred.find(function(tab){return available[tab];});
  if(first) switchTab(first);
}


function medianNumber(values){
  var nums=(values||[]).filter(function(v){return v!==null&&v!==undefined&&!isNaN(v);}).map(Number).sort(function(a,b){return a-b;});
  if(!nums.length) return null;
  var mid=Math.floor(nums.length/2);
  return nums.length%2 ? nums[mid] : (nums[mid-1]+nums[mid])/2;
}
function percent(value,total){
  return total>0 ? Math.round((value/total)*100) : 0;
}
function estimatedTripInstances(trip){
  if(!trip) return 0;
  var freqs=(DATA.frequenciesByTrip && DATA.frequenciesByTrip[trip.trip_id]) || [];
  if(!freqs.length) return 1;
  return freqs.reduce(function(sum,f){
    var start=timeToSecs(f.start_time), end=timeToSecs(f.end_time), step=csvNum(f.headway_secs,0);
    if(step<=0 || end<=start) return sum;
    return sum+Math.ceil((end-start)/step);
  },0);
}
function primaryServiceId(){
  var services=(DATA.serviceIds||[]).slice().sort(sortServices);
  return services.indexOf('L')!==-1?'L':(services.indexOf('LJ')!==-1?'LJ':(services[0]||''));
}
function buildNetworkAnalytics(){
  if(DATA.analytics) return DATA.analytics;
  var serviceId=primaryServiceId();
  var trips=serviceId ? (DATA.tripsByService[serviceId]||[]) : Object.values(DATA.trips);
  var activeRoutes={}, usedStops={}, routeOffer={}, earliest=null, latest=null;
  var withShape=0, withTimes=0, bothDirs={}, stopCounts=[];
  trips.forEach(function(t){
    activeRoutes[t.route_id]=true;
    if(!routeOffer[t.route_id]) routeOffer[t.route_id]=0;
    routeOffer[t.route_id]+=estimatedTripInstances(t);
    if(t.shape_id && DATA.shapes[t.shape_id] && DATA.shapes[t.shape_id].length) withShape++;
    var st=DATA.stopTimes[t.trip_id]||[];
    if(st.length){
      withTimes++;
      stopCounts.push(st.length);
      st.forEach(function(row){usedStops[row.stop_id]=true;});
      var first=timeToSecs(st[0].departure_time||st[0].arrival_time||'');
      var last=timeToSecs(st[st.length-1].arrival_time||st[st.length-1].departure_time||'');
      if(first || first===0) earliest=earliest===null?first:Math.min(earliest,first);
      if(last || last===0) latest=latest===null?last:Math.max(latest,last);
    }
    if(!bothDirs[t.route_id]) bothDirs[t.route_id]={};
    bothDirs[t.route_id][tripDir(t)]=true;
  });
  var allStops=Object.values(DATA.stops);
  var coords=allStops.filter(function(s){return s.stop_lat!==null&&s.stop_lon!==null&&!isNaN(s.stop_lat)&&!isNaN(s.stop_lon);}).length;
  var routeRows=Object.keys(routeOffer).map(function(rid){
    var route=DATA.routes[rid]||{};
    return {route:route,id:rid,label:route.route_short_name||route.route_id||rid,offer:routeOffer[rid]};
  }).sort(function(a,b){return b.offer-a.offer || String(a.label).localeCompare(String(b.label),undefined,{numeric:true});});
  var bothCount=Object.keys(activeRoutes).filter(function(rid){return bothDirs[rid]&&bothDirs[rid]['0']&&bothDirs[rid]['1'];}).length;
  DATA.analytics={
    serviceId:serviceId,
    serviceLabel:serviceLabel(serviceId),
    trips:trips.length,
    activeRoutes:Object.keys(activeRoutes).length,
    usedStops:Object.keys(usedStops).length,
    estimatedDepartures:routeRows.reduce(function(sum,r){return sum+r.offer;},0),
    earliest:earliest,
    latest:latest,
    coordsPct:percent(coords,allStops.length),
    shapePct:percent(withShape,trips.length),
    stopTimesPct:percent(withTimes,trips.length),
    bothDirsPct:percent(bothCount,Object.keys(activeRoutes).length),
    medianStops:medianNumber(stopCounts),
    routeRows:routeRows
  };
  return DATA.analytics;
}
function metricCard(label,value,sub){
  return '<div class="metric-card"><div class="lbl">'+esc(label)+'</div><div class="val">'+esc(value)+'</div>'+(sub?'<div class="sub">'+esc(sub)+'</div>':'')+'</div>';
}
function sourceStatus(label,available,detail,warning){
  return '<div class="source-item '+(available?(warning?'warn':'ok'):'')+'"><span class="source-dot"></span><div><strong>'+esc(label)+'</strong><small>'+esc(detail)+'</small></div></div>';
}
function renderOverview(){
  var a=buildNetworkAnalytics();
  var stats=document.getElementById('stats-row');
  if(stats){
    var windowLabel=(a.earliest===null||a.latest===null)?'—':secsToTime(a.earliest)+'–'+secsToTime(a.latest);
    stats.innerHTML=[
      ['Recorridos activos',a.activeRoutes.toLocaleString('es-CL'),a.serviceLabel],
      ['Salidas estimadas',a.estimatedDepartures.toLocaleString('es-CL'),'día tipo seleccionado'],
      ['Paradas utilizadas',a.usedStops.toLocaleString('es-CL'),'con atención programada'],
      ['Ventana de servicio',windowLabel,'primera salida a última llegada']
    ].map(function(x){return '<div class="stat-card"><div class="lbl">'+esc(x[0])+'</div><div class="val">'+esc(x[1])+'</div><div class="sub">'+esc(x[2])+'</div></div>';}).join('');
  }

  var health=document.getElementById('overview-health');
  if(health){
    health.innerHTML=[
      ['Paraderos ubicados en el mapa',a.coordsPct],
      ['Viajes con trazado',a.shapePct],
      ['Viajes con horarios',a.stopTimesPct],
      ['Recorridos con ambos sentidos',a.bothDirsPct]
    ].map(function(item){
      return '<div class="health-item"><strong>'+esc(item[0])+'</strong><span>'+item[1]+'%</span><div class="health-bar"><i style="width:'+item[1]+'%"></i></div></div>';
    }).join('');
  }

  var sources=document.getElementById('overview-sources');
  if(sources){
    var decoDetail=!DATA.availableSources.deco?'No disponible para esta fecha':
      (DATA.decoCompatible?'Disponible':'Corresponde a otra fecha');
    sources.innerHTML=
      sourceStatus('Recorridos y horarios',true,formatDatasetDate(DATA.sourceDates.gtfs),false)+
      sourceStatus('Operadores y servicios',DATA.availableSources.deco,decoDetail,DATA.availableSources.deco&&!DATA.decoCompatible)+
      sourceStatus('Indicadores',DATA.availableSources.param,DATA.availableSources.param?'Disponibles':'No disponibles para esta fecha',false);
  }

  var canvas=document.getElementById('overview-chart');
  if(canvas && window.Chart){
    if(overviewChart) overviewChart.destroy();
    var top=a.routeRows.slice(0,10);
    overviewChart=new Chart(canvas.getContext('2d'),{
      type:'bar',
      data:{
        labels:top.map(function(r){return r.label;}),
        datasets:[{label:'Salidas estimadas',data:top.map(function(r){return r.offer;}),backgroundColor:'rgba(152,37,28,.82)',borderRadius:5}]
      },
      options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},tooltip:{callbacks:{afterLabel:function(){return a.serviceLabel;}}}},
        scales:{
          x:{beginAtZero:true,grid:{color:'rgba(23,32,39,.06)'},title:{display:true,text:'salidas estimadas'}},
          y:{grid:{display:false}}
        }
      }
    });
  }
}

function buildUI(){
  var selR=document.getElementById('sel-route');
  selR.innerHTML='';
  Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0;})
    .sort(function(a,b){return String(a.route_short_name||a.route_id).localeCompare(String(b.route_short_name||b.route_id),undefined,{numeric:true});})
    .forEach(function(r){
      var o=document.createElement('option');
      o.value=r.route_id;
      o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||'Sin nombre');
      selR.appendChild(o);
    });

  fillOperatorSelect('sel-operator');
  fillOperatorSelect('sel-operator-stop');
  setupSimulationSelectors();
  refreshDataAge();
  updateStopGlobalServices();

  selR.addEventListener('change',function(){updateRouteServiceOptions();renderAll();});
  document.getElementById('sel-operator').addEventListener('change',updateRouteOptionsByOperator);
  document.getElementById('sel-operator-stop').addEventListener('change',function(){if(activeStop) renderStop(activeStop);});
  document.getElementById('sel-service').addEventListener('change',renderAll);
  document.getElementById('sel-service-stop').addEventListener('change',function(){if(activeStop) renderStop(activeStop);});

  bindSimulationEvents();
  setupStopSearch();
  updateRouteServiceOptions();
  renderOverview();
  renderAll();
  configureAvailableTabs();
}


function updateRouteOptionsByOperator(){
  var op=document.getElementById('sel-operator').value;
  var selR=document.getElementById('sel-route'), old=selR.value;
  selR.innerHTML='';
  var routes=Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0 && routeMatchesOperator(r,op);})
    .sort(function(a,b){return String(a.route_short_name).localeCompare(String(b.route_short_name),undefined,{numeric:true});});
  routes.forEach(function(r){ var o=document.createElement('option'); o.value=r.route_id; o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||''); selR.appendChild(o); });
  if(routes.some(function(r){return String(r.route_id)===String(old);})) selR.value=old;
  updateRouteServiceOptions(); renderAll();
}
function routeServices(routeId){
  return unique((DATA.tripsByRoute[String(routeId)]||[]).map(function(t){return t.service_id;})).sort(sortServices);
}
function routeDirs(routeId, serviceId){
  return unique((DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(serviceId);}).map(function(t){return tripDir(t);})).sort();
}
function fillServiceSelect(sel, services){
  var old=sel.value; sel.innerHTML='';
  services.forEach(function(s){ var o=document.createElement('option'); o.value=s; o.textContent=serviceLabel(s); sel.appendChild(o); });
  if(services.indexOf(old)!==-1) sel.value=old;
  else if(services.length) sel.value=services[0];
}
function updateRouteServiceOptions(){
  var routeId=document.getElementById('sel-route').value;
  fillServiceSelect(document.getElementById('sel-service'), routeServices(routeId));
  syncDirectionControls();
}
function updateStopGlobalServices(){
  fillServiceSelect(document.getElementById('sel-service-stop'), DATA.serviceIds);
}
function stopServices(stopId){
  return unique((DATA.stopTrips[stopId]||[]).map(function(e){var t=DATA.trips[e.trip_id]; return t?t.service_id:null;})).sort(sortServices);
}
function updateStopServiceOptions(stopId){
  var services=stopServices(stopId);
  if(services.length) fillServiceSelect(document.getElementById('sel-service-stop'), services);
}
function syncDirectionControls(){
  var routeId=document.getElementById('sel-route').value;
  var svcId=document.getElementById('sel-service').value;
  var dirs=routeDirs(routeId, svcId);
  if(dirs.indexOf(String(curMapDir))===-1 && curMapDir!==-1) curMapDir = dirs.indexOf('0')!==-1 ? 0 : Number(dirs[0]||0);
  if(dirs.length<2 && curMapDir===-1) curMapDir = Number(dirs[0]||0);
  if(dirs.indexOf(String(curStopsDir))===-1) curStopsDir = dirs.indexOf('0')!==-1 ? 0 : Number(dirs[0]||0);

  ['map-btn-0','map-btn-1','map-btn-both','stops-btn-0','stops-btn-1'].forEach(function(id){var el=document.getElementById(id); if(el) el.style.display='none';});
  if(dirs.indexOf('0')!==-1){ document.getElementById('map-btn-0').style.display='inline-block'; document.getElementById('stops-btn-0').style.display='inline-block'; }
  if(dirs.indexOf('1')!==-1){ document.getElementById('map-btn-1').style.display='inline-block'; document.getElementById('stops-btn-1').style.display='inline-block'; }
  if(dirs.length>1) document.getElementById('map-btn-both').style.display='inline-block';
  setMapDir(curMapDir, true);
  setStopsDir(curStopsDir, true);
}


function setParamStatus(txt){
  var el=document.getElementById('param-status');
  if(el) el.textContent=txt;
}
function ensureParamsLoaded(){
  if(PARAMS.sheets && PARAMS.sheets.length) return;
  var sel=document.getElementById('param-file-select');
  if(sel && sel.value && !PARAMS.loading) loadSelectedParams();
}
function xlsxColIndex(ref){
  var m=String(ref||'').match(/[A-Z]+/); if(!m) return 0;
  var s=m[0], n=0;
  for(var i=0;i<s.length;i++) n=n*26+(s.charCodeAt(i)-64);
  return n-1;
}
function xlsxText(xmlNode, tag){
  var a=xmlNode.getElementsByTagName(tag);
  return a && a[0] ? a[0].textContent : '';
}
function xlsxRelPath(base, target){
  target=String(target||'');
  if(target.charAt(0)==='/') return target.replace(/^\//,'');
  return base.replace(/[^\/]+$/,'')+target;
}
function parseSharedStringsXml(xml){
  if(!xml) return [];
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var si=doc.getElementsByTagName('si'), out=[];
  for(var i=0;i<si.length;i++){
    var texts=si[i].getElementsByTagName('t'), s='';
    for(var j=0;j<texts.length;j++) s+=texts[j].textContent || '';
    out.push(s);
  }
  return out;
}
function xlsxCellValue(cell, sharedStrings){
  var t=cell.getAttribute('t') || '';
  if(t==='inlineStr'){
    var inline=cell.getElementsByTagName('is')[0];
    return inline ? xlsxText(inline,'t') : '';
  }
  var v=cell.getElementsByTagName('v')[0];
  var raw=v ? v.textContent : '';
  if(t==='s') return sharedStrings[Number(raw)] || '';
  if(t==='b') return raw==='1' ? 'Sí' : 'No';
  return raw;
}
function excelTimeLabel(v){
  if(v===null || v===undefined || v==='') return '';
  var n=Number(v);
  if(!isNaN(n) && n>=0 && n<1){
    var total=Math.round(n*86400), h=Math.floor(total/3600)%24, m=Math.floor((total%3600)/60);
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
  return String(v);
}
function paramNumber(v){
  if(v===null || v===undefined || v==='') return null;
  var n=Number(String(v).replace(',','.'));
  return isNaN(n) ? null : n;
}
function sheetMetricFromName(name){
  var m=String(name||'').match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)\(/);
  return m ? m[1].trim() : String(name||'');
}
function sheetPeriodFromName(name){
  var m=String(name||'').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : '';
}
async function loadWorkbookMeta(fileObj){
  var res=await fetch(fileObj.download_url,{cache:'no-store'});
  if(!res.ok) throw new Error('No se pudieron descargar los indicadores ('+res.status+').');
  var blob=await res.blob();
  var zip=await JSZip.loadAsync(blob);
  var wbXml=await zip.file('xl/workbook.xml').async('string');
  var relXml=await zip.file('xl/_rels/workbook.xml.rels').async('string');
  var wbDoc=new DOMParser().parseFromString(wbXml,'application/xml');
  var relDoc=new DOMParser().parseFromString(relXml,'application/xml');
  var rels={};
  Array.prototype.forEach.call(relDoc.getElementsByTagName('Relationship'),function(r){
    rels[r.getAttribute('Id')]=xlsxRelPath('xl/workbook.xml',r.getAttribute('Target'));
  });
  var sheets=[];
  Array.prototype.forEach.call(wbDoc.getElementsByTagName('sheet'),function(s){
    var rid=s.getAttribute('r:id') || s.getAttribute('id');
    var name=s.getAttribute('name') || '';
    if(name.toLowerCase()==='diccio') return;
    sheets.push({name:name, path:rels[rid], metric:sheetMetricFromName(name), period:sheetPeriodFromName(name)});
  });
  PARAMS.file=fileObj; PARAMS.zip=zip; PARAMS.sheets=sheets; PARAMS.cache={}; PARAMS.sharedStrings=null;
  PARAMS.sourceDate=extractDateFromName(fileObj.name);
  DATA.sourceNames.param=fileObj.name;
  DATA.sourceDates.param=PARAMS.sourceDate;
}
async function getSharedStrings(){
  if(PARAMS.sharedStrings) return PARAMS.sharedStrings;
  var f=PARAMS.zip.file('xl/sharedStrings.xml');
  PARAMS.sharedStrings=f ? parseSharedStringsXml(await f.async('string')) : [];
  return PARAMS.sharedStrings;
}
async function parseParameterSheet(sheetName){
  if(PARAMS.cache[sheetName]) return PARAMS.cache[sheetName];
  var sheet=PARAMS.sheets.find(function(s){return s.name===sheetName;});
  if(!sheet || !sheet.path) throw new Error('No se encontró el indicador seleccionado.');
  var xml=await PARAMS.zip.file(sheet.path).async('string');
  var doc=new DOMParser().parseFromString(xml,'application/xml');
  var shared=await getSharedStrings();
  var matrix=[];
  Array.prototype.forEach.call(doc.getElementsByTagName('row'),function(row){
    var rIndex=Number(row.getAttribute('r')||0)-1;
    if(!matrix[rIndex]) matrix[rIndex]=[];
    Array.prototype.forEach.call(row.getElementsByTagName('c'),function(c){
      matrix[rIndex][xlsxColIndex(c.getAttribute('r'))]=xlsxCellValue(c,shared);
    });
  });
  var metric=String((matrix[0] && (matrix[0][1] || matrix[0][0])) || sheet.metric || '').trim();
  var dayRow=matrix[1]||[], bandRow=matrix[2]||[], startRow=matrix[3]||[], endRow=matrix[4]||[];
  var intervals=[], lastDay='';
  for(var col=5; col<Math.max(dayRow.length,bandRow.length,startRow.length,endRow.length); col++){
    if(dayRow[col]) lastDay=String(dayRow[col]);
    intervals.push({
      col:col,
      day:lastDay || '',
      band:String(bandRow[col]||'').trim(),
      start:excelTimeLabel(startRow[col]),
      end:excelTimeLabel(endRow[col])
    });
  }
  var rows=[];
  for(var i=5;i<matrix.length;i++){
    var r=matrix[i]||[];
    if(!r[0] && !r[1] && !r[2]) continue;
    rows.push({
      unidad:String(r[0]||'').trim(),
      codigoTs:String(r[1]||'').trim(),
      codigoUsuario:String(r[2]||'').trim(),
      sentido:String(r[3]||'').trim(),
      tipo:String(r[4]||'').trim(),
      values:intervals.map(function(it){return r[it.col]===undefined?'':r[it.col];})
    });
  }
  var parsed={sheet:sheet, metric:metric, intervals:intervals, rows:rows};
  PARAMS.cache[sheetName]=parsed;
  return parsed;
}
function fillParamSheets(){
  var sel=document.getElementById('param-sheet-select'); if(!sel) return;
  sel.innerHTML='';
  PARAMS.sheets.forEach(function(s,i){
    var o=document.createElement('option');
    o.value=s.name; o.textContent=s.metric+' — '+s.period;
    sel.appendChild(o);
    if(i===0) o.selected=true;
  });
}
async function loadSelectedParams(){
  syncParamSelects('tab');
  var sel=document.getElementById('param-file-select');
  if(!sel || !sel.value){ alert('No hay indicadores disponibles para esta fecha.'); return; }
  var fileObj={name:(sel.options[sel.selectedIndex].dataset.name || sel.options[sel.selectedIndex].textContent), download_url:sel.value};
  PARAMS.loading=true; setParamStatus('Cargando indicadores…');
  try{
    await loadWorkbookMeta(fileObj);
    fillParamSheets();
    setParamStatus('Indicadores listos. Selecciona un período o usa los filtros.');
    await renderSelectedParamSheet();
  }catch(err){
    console.error(err);
    setParamStatus('No se pudieron cargar los indicadores: '+(err.message||err));
  }finally{
    PARAMS.loading=false;
  }
}
async function renderSelectedParamSheet(){
  if(!PARAMS.sheets.length) return;
  var sheetSel=document.getElementById('param-sheet-select');
  var sheetName=sheetSel && sheetSel.value ? sheetSel.value : PARAMS.sheets[0].name;
  setParamStatus('Preparando indicador…');
  var parsed=await parseParameterSheet(sheetName);
  PARAMS.activeSheet=sheetName; PARAMS.rows=parsed.rows; PARAMS.intervals=parsed.intervals; PARAMS.metric=parsed.metric;
  fillParamFilters(parsed);
  document.getElementById('param-panel').style.display='block';
  renderParamsTable();
  setParamStatus('Indicadores listos: '+parsed.rows.length+' resultados en '+parsed.sheet.name+'.');
}
function fillParamSelect(id, values, allLabel){
  var sel=document.getElementById(id); if(!sel) return;
  var old=sel.value; sel.innerHTML='';
  var all=document.createElement('option'); all.value='__all'; all.textContent=allLabel; sel.appendChild(all);
  values.forEach(function(v){ var o=document.createElement('option'); o.value=v; o.textContent=v; sel.appendChild(o); });
  sel.value=values.indexOf(old)!==-1 ? old : '__all';
}
function fillParamFilters(parsed){
  fillParamSelect('param-operator', unique(parsed.rows.map(function(r){return r.unidad;})).sort(), 'Todas');
  fillParamSelect('param-sentido', unique(parsed.rows.map(function(r){return r.sentido;})).sort(), 'Todos');
  fillParamSelect('param-tipo', unique(parsed.rows.map(function(r){return r.tipo;})).sort(), 'Todos');
}
function filteredParamRows(){
  var op=document.getElementById('param-operator').value;
  var sentido=document.getElementById('param-sentido').value;
  var tipo=document.getElementById('param-tipo').value;
  var q=normalizeOpKey(document.getElementById('param-route-search').value);
  return PARAMS.rows.filter(function(r){
    if(op!=='__all' && r.unidad!==op) return false;
    if(sentido!=='__all' && r.sentido!==sentido) return false;
    if(tipo!=='__all' && r.tipo!==tipo) return false;
    if(q){
      var hay=normalizeOpKey(r.codigoUsuario+' '+r.codigoTs);
      if(hay.indexOf(q)===-1) return false;
    }
    return true;
  });
}
function renderParamsTable(){
  var wrap=document.getElementById('param-table-wrap');
  var title=document.getElementById('param-table-title');
  var note=document.getElementById('param-sheet-note');
  var summary=document.getElementById('param-summary');
  if(!wrap||!PARAMS.rows.length) return;
  var rows=filteredParamRows();
  var intervals=PARAMS.intervals||[];
  var maxRows=180,shown=rows.slice(0,maxRows),nums=[];
  rows.forEach(function(r){r.values.forEach(function(v){var n=paramNumber(v);if(n!==null) nums.push(n);});});
  var average=nums.length?nums.reduce(function(a,b){return a+b;},0)/nums.length:null;
  var med=medianNumber(nums);
  var min=nums.length?nums.reduce(function(a,b){return Math.min(a,b);},nums[0]):null;
  var max=nums.length?nums.reduce(function(a,b){return Math.max(a,b);},nums[0]):null;
  if(title) title.textContent=PARAMS.metric||PARAMS.activeSheet||'Detalle';
  if(note) note.textContent='Se muestran hasta '+maxRows+' resultados. Los indicadores consideran todos los registros encontrados.';
  if(summary){
    summary.innerHTML=
      metricCard('Resultados',rows.length.toLocaleString('es-CL'),'registros encontrados')+
      metricCard('Intervalos',intervals.length.toLocaleString('es-CL'),'períodos disponibles')+
      metricCard('Promedio',average===null?'—':average.toFixed(2),'valores disponibles')+
      metricCard('Mediana',med===null?'—':med.toFixed(2),'valor central')+
      metricCard('Rango',min===null?'—':min.toFixed(2)+'–'+max.toFixed(2),'mínimo a máximo');
  }
  if(!rows.length){
    wrap.innerHTML='<div class="no-data">No hay resultados con los filtros actuales.</div>';
    return;
  }
  var head='<tr><th class="sticky-col">Recorrido</th><th>Código interno</th><th>Operador</th><th>Sentido</th><th>Tipo</th>'+
    intervals.map(function(it){return '<th>'+esc(it.day)+'<br><span class="param-cell-muted">'+esc(it.band)+' '+esc(it.start)+'–'+esc(it.end)+'</span></th>';}).join('')+'</tr>';
  var body=shown.map(function(r){
    return '<tr><td class="sticky-col"><b>'+esc(r.codigoUsuario)+'</b></td><td>'+esc(r.codigoTs)+'</td><td>'+esc(r.unidad)+'</td><td>'+esc(r.sentido)+'</td><td>'+esc(r.tipo)+'</td>'+
      r.values.map(function(v){return '<td>'+esc(v===''?'—':v)+'</td>';}).join('')+'</tr>';
  }).join('');
  var more=rows.length>maxRows?'<div class="param-status">Hay '+(rows.length-maxRows)+' resultados adicionales.</div>':'';
  wrap.innerHTML='<div class="tbl-wrap"><table class="param-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'+more;
}
function syncParamRouteFromGTFS(){
  var sel=document.getElementById('sel-route'), inp=document.getElementById('param-route-search');
  if(!sel || !sel.value || !inp) return;
  var r=DATA.routes[sel.value];
  inp.value = r ? (r.route_short_name || r.route_id || '') : '';
  if(document.getElementById('tab-parametros').style.display==='none') switchTab('parametros');
  else renderParamsTable();
}
document.addEventListener('change',function(e){
  if(e.target && e.target.id==='param-sheet-select') renderSelectedParamSheet();
  if(e.target && /^(param-operator|param-sentido|param-tipo)$/.test(e.target.id)) renderParamsTable();
});
document.addEventListener('input',function(e){
  if(e.target && e.target.id==='param-route-search') renderParamsTable();
});




function addInstitutionalTiles(map,maxZoom){
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap contributors',
    maxZoom:maxZoom||19,
    updateWhenIdle:true,
    keepBuffer:3
  }).addTo(map);
}
function fitRouteMap(){
  if(leafMap && routeMapBounds && routeMapBounds.isValid()){
    leafMap.invalidateSize();
    leafMap.fitBounds(routeMapBounds,{padding:[28,28],maxZoom:16});
  }
}

function initMap(){
  if(leafMap) return;
  leafMap=L.map('map',{zoomControl:false,preferCanvas:true}).setView([-33.45,-70.65],11);
  addInstitutionalTiles(leafMap,19);
  L.control.zoom({position:'topright'}).addTo(leafMap);
}

function setMapDir(dir, skipRender){
  curMapDir = Number(dir);
  ['0','1','both'].forEach(function(d){ var el=document.getElementById('map-btn-'+d); if(el) el.classList.toggle('active', String(curMapDir)===(d==='both'?'-1':d)); });
  if(!skipRender) renderMap();
}
function renderMap(){
  if(!leafMap) return;
  if(layerIda){leafMap.removeLayer(layerIda);layerIda=null;}
  if(layerReg){leafMap.removeLayer(layerReg);layerReg=null;}
  if(layerStops){leafMap.removeLayer(layerStops);layerStops=null;}

  var bounds=[],stopSet={},stopGroup=L.layerGroup();
  function drawDirection(dir,color){
    var trips=getTrips(dir);
    if(!trips.length) return;
    var group=L.layerGroup();
    var refTrip=trips.find(function(t){return DATA.stopTimes[t.trip_id]&&DATA.stopTimes[t.trip_id].length;})||trips[0];
    var shapeTrip=trips.find(function(t){return t.shape_id&&DATA.shapes[t.shape_id]&&DATA.shapes[t.shape_id].length;});
    var stopSeq=refTrip?(DATA.stopTimes[refTrip.trip_id]||[]):[];
    var latlngs=[];

    if(shapeTrip){
      latlngs=DATA.shapes[shapeTrip.shape_id].map(function(p){return [p.lat,p.lng];});
    }else{
      latlngs=stopSeq.map(function(st){
        var stop=DATA.stops[st.stop_id];
        return stop&&stop.stop_lat!==null&&stop.stop_lon!==null?[+stop.stop_lat,+stop.stop_lon]:null;
      }).filter(Boolean);
    }

    if(latlngs.length){
      L.polyline(latlngs,{color:'#172027',weight:9,opacity:.12,lineCap:'round',lineJoin:'round'}).addTo(group);
      L.polyline(latlngs,{color:color,weight:5,opacity:.92,lineCap:'round',lineJoin:'round',dashArray:shapeTrip?null:'8 7'}).addTo(group);
      bounds=bounds.concat(latlngs);
    }

    stopSeq.forEach(function(st,i){
      if(stopSet[st.stop_id]) return;
      stopSet[st.stop_id]=true;
      var stop=DATA.stops[st.stop_id];
      if(!stop||stop.stop_lat===null||stop.stop_lon===null) return;
      var isFirst=i===0,isLast=i===stopSeq.length-1;
      var dotColor=isFirst?'#15803d':(isLast?'#dc2626':'#46545e');
      var radius=isFirst||isLast?8:4;
      var marker=L.circleMarker([+stop.stop_lat,+stop.stop_lon],{
        radius:radius,fillColor:dotColor,color:'#fff',weight:2,opacity:1,fillOpacity:1
      });
      marker.bindTooltip(String(i+1),{direction:'top',offset:[0,-4],opacity:.85});
      marker.bindPopup(
        '<b>'+esc(cleanName(stop.stop_name||st.stop_id))+'</b>'+
        '<br><small>'+esc(st.stop_id)+' · parada '+(i+1)+' de '+stopSeq.length+'</small>'+
        '<br><small>'+esc(dirName(dir))+'</small>'
      );
      marker.addTo(stopGroup);
    });

    group.addTo(leafMap);
    if(String(dir)==='0') layerIda=group; else layerReg=group;
  }

  if(curMapDir===0||curMapDir===-1) drawDirection(0,'#2563eb');
  if(curMapDir===1||curMapDir===-1) drawDirection(1,'#dc2626');
  layerStops=stopGroup.addTo(leafMap);
  var count=document.getElementById('map-stop-count');
  if(count) count.textContent=Object.keys(stopSet).length?Object.keys(stopSet).length+' paradas únicas':'Sin paradas';
  routeMapBounds=bounds.length?L.latLngBounds(bounds):null;
  fitRouteMap();
  if(CURRENT_MAP_MODE==='ruta' && APP_MODE==='realtime') renderRouteBusOverlay();
}


function routeStopIds(routeId,serviceId){
  var seen={};
  (DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(serviceId);}).forEach(function(t){
    (DATA.stopTimes[t.trip_id]||[]).forEach(function(st){seen[st.stop_id]=true;});
  });
  return Object.keys(seen);
}
function departureMedianGap(departures){
  if(!departures || departures.length<2) return null;
  var times=departures.map(function(d){return d.departure;}).sort(function(a,b){return a-b;});
  var gaps=[];
  for(var i=1;i<times.length;i++){
    var gap=(times[i]-times[i-1])/60;
    if(gap>0 && gap<=180) gaps.push(gap);
  }
  return medianNumber(gaps);
}
function renderRouteInsights(){
  var routeSel=document.getElementById('sel-route');
  var serviceSel=document.getElementById('sel-service');
  if(!routeSel||!serviceSel||!routeSel.value) return;
  var routeId=routeSel.value, serviceId=serviceSel.value;
  var route=DATA.routes[routeId]||{};
  var departures=routeDepartures(routeId,serviceId,-1);
  var durations=departures.map(function(d){return Math.max(0,(d.arrival-d.departure)/60);}).filter(function(v){return v>0;});
  var first=departures.length?departures[0].departure:null;
  var last=departures.length?departures.reduce(function(m,d){return Math.max(m,d.arrival);},departures[0].arrival):null;
  var gap=departureMedianGap(departures);
  var stops=routeStopIds(routeId,serviceId);
  var name=document.getElementById('route-context-name');
  var meta=document.getElementById('route-context-meta');
  if(name) name.textContent=(route.route_short_name||route.route_id||routeId)+' · '+(route.route_long_name||'Sin nombre');
  if(meta){
    var operator=routeOperator(route);
    meta.textContent=serviceLabel(serviceId)+' · '+(DATA.decoCompatible?operator:'Operador no disponible para esta fecha');
  }
  var wrap=document.getElementById('route-kpis');
  if(wrap){
    wrap.innerHTML=
      metricCard('Salidas estimadas',departures.length.toLocaleString('es-CL'),'ambos sentidos')+
      metricCard('Horario del servicio',first===null?'—':secsToTime(first)+'–'+secsToTime(last),'primera salida a última llegada')+
      metricCard('Duración mediana',durations.length?Math.round(medianNumber(durations))+' min':'—','viaje completo')+
      metricCard('Intervalo mediano',gap===null?'—':Math.round(gap)+' min','entre salidas consecutivas')+
      metricCard('Paradas únicas',stops.length.toLocaleString('es-CL'),'en el día seleccionado');
  }
}
function hourlyDepartureProfile(routeId,serviceId,dir){
  var departures=routeDepartures(routeId,serviceId,dir);
  var buckets=[];
  for(var h=0;h<24;h++) buckets.push({hour:h,count:0,gaps:[],median:null});
  var previous=null;
  departures.forEach(function(d){
    var hour=((Math.floor(d.departure/3600)%24)+24)%24;
    buckets[hour].count++;
    if(previous!==null){
      var gap=(d.departure-previous)/60;
      if(gap>0&&gap<=180) buckets[hour].gaps.push(gap);
    }
    previous=d.departure;
  });
  buckets.forEach(function(b){b.median=medianNumber(b.gaps);});
  return buckets;
}

function renderAll(){
  syncDirectionControls();
  renderRouteInsights();
  renderFreqs();
  renderMap();
  renderDeparturesTable();
  syncSimulationFromRoute();
  renderSimulation();
}
function getTrips(dir){
  var routeId=document.getElementById('sel-route').value, svcId=document.getElementById('sel-service').value;
  return (DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(svcId) && (dir===-1||tripDir(t)===String(dir));});
}
function getFreqsForTrips(trips){
  var out=[];
  trips.forEach(function(t){
    var arr=DATA.frequenciesByTrip && DATA.frequenciesByTrip[t.trip_id] ? DATA.frequenciesByTrip[t.trip_id] : [];
    for(var i=0;i<arr.length;i++) out.push(arr[i]);
  });
  if(out.length) return out;
  var ids={}; trips.forEach(function(t){ids[t.trip_id]=true;});
  return DATA.frequencies.filter(function(f){return ids[f.trip_id];});
}
function scheduledHeadways(trips){
  var byHour={};
  trips.forEach(function(t){
    var st=DATA.stopTimes[t.trip_id]; if(!st||!st.length) return;
    var s=timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
    var h=Math.floor(s/3600); if(h<0||h>27) return;
    if(!byHour[h]) byHour[h]=[]; byHour[h].push(s);
  });
  var out=[];
  Object.keys(byHour).forEach(function(h){
    var arr=byHour[h].sort(function(a,b){return a-b;});
    if(arr.length===1) out.push({start_time:String(h).padStart(2,'0')+':00:00', end_time:String(Number(h)+1).padStart(2,'0')+':00:00', headway_secs:3600});
    else {
      var diffs=[]; for(var i=1;i<arr.length;i++) diffs.push(arr[i]-arr[i-1]);
      var avg=Math.round(diffs.reduce(function(a,b){return a+b;},0)/diffs.length);
      out.push({start_time:String(h).padStart(2,'0')+':00:00', end_time:String(Number(h)+1).padStart(2,'0')+':00:00', headway_secs:avg});
    }
  });
  return out;
}
function renderFreqs(){
  var routeId=document.getElementById('sel-route').value;
  var serviceId=document.getElementById('sel-service').value;
  var ida=hourlyDepartureProfile(routeId,serviceId,0);
  var regreso=hourlyDepartureProfile(routeId,serviceId,1);
  renderFreqTable(ida,regreso);
  renderFreqChart(ida,regreso);
}
function renderFreqTable(ida,regreso){
  var wrap=document.getElementById('freq-table-wrap');
  var dirs=routeDirs(document.getElementById('sel-route').value,document.getElementById('sel-service').value);
  var rows=[];
  for(var h=0;h<24;h++){
    var a=ida[h],b=regreso[h];
    if((a?a.count:0)+(b?b.count:0)===0) continue;
    var cells='<td><b>'+String(h).padStart(2,'0')+':00–'+String((h+1)%24).padStart(2,'0')+':00</b></td>';
    if(dirs.indexOf('0')!==-1){
      cells+='<td>'+a.count+'</td><td>'+(a.median===null?'—':'<span class="freq-pill '+freqClass(a.median)+'">'+Math.round(a.median)+' min</span>')+'</td>';
    }
    if(dirs.indexOf('1')!==-1){
      cells+='<td>'+b.count+'</td><td>'+(b.median===null?'—':'<span class="freq-pill '+freqClass(b.median)+'">'+Math.round(b.median)+' min</span>')+'</td>';
    }
    rows.push('<tr>'+cells+'</tr>');
  }
  if(!rows.length){
    wrap.innerHTML='<div class="no-data">No hay salidas programadas para este filtro.</div>';
    return;
  }
  var head='<th>Franja</th>';
  if(dirs.indexOf('0')!==-1) head+='<th>Salidas ida</th><th>Intervalo mediano</th>';
  if(dirs.indexOf('1')!==-1) head+='<th>Salidas regreso</th><th>Intervalo mediano</th>';
  wrap.innerHTML='<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
function renderFreqChart(ida,regreso){
  var dirs=routeDirs(document.getElementById('sel-route').value,document.getElementById('sel-service').value);
  var labels=[];
  for(var h=0;h<24;h++) labels.push(String(h).padStart(2,'0')+'h');
  var datasets=[];
  if(dirs.indexOf('0')!==-1) datasets.push({label:'Ida',data:ida.map(function(b){return b.count;}),backgroundColor:'rgba(37,99,235,.78)',borderRadius:4});
  if(dirs.indexOf('1')!==-1) datasets.push({label:'Regreso',data:regreso.map(function(b){return b.count;}),backgroundColor:'rgba(220,38,38,.72)',borderRadius:4});
  var canvas=document.getElementById('freq-chart');
  if(!canvas) return;
  if(freqChart) freqChart.destroy();
  freqChart=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels:labels,datasets:datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',labels:{boxWidth:12,font:{size:11}}}},
      scales:{
        y:{beginAtZero:true,title:{display:true,text:'salidas'},ticks:{precision:0},grid:{color:'rgba(23,32,39,.06)'}},
        x:{grid:{display:false},ticks:{font:{size:9},maxRotation:0}}
      }
    }
  });
}
function setStopsDir(dir, skipRender){
  curStopsDir=Number(dir);
  var b0=document.getElementById('stops-btn-0'), b1=document.getElementById('stops-btn-1');
  if(b0) b0.classList.toggle('active',curStopsDir===0); if(b1) b1.classList.toggle('active',curStopsDir===1);
  if(!skipRender) renderStopsTable();
}
function tripDurationSecs(tripId){
  var st=DATA.stopTimes[tripId]||[];
  if(st.length<2) return 0;
  var first=timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
  var last=timeToSecs(st[st.length-1].arrival_time||st[st.length-1].departure_time||'0:00:00');
  return Math.max(0,last-first);
}
function tripStartEnd(tripId){
  var st=DATA.stopTimes[tripId]||[];
  if(!st.length) return null;
  var dep=timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
  var arr=timeToSecs(st[st.length-1].arrival_time||st[st.length-1].departure_time||'0:00:00');
  return {departure:dep, arrival:arr};
}
function routeDepartures(routeId, serviceId, dir){
  var trips=(DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){
    return String(t.service_id)===String(serviceId) && (dir===-1 || tripDir(t)===String(dir));
  });
  var out=[], seen={};
  trips.forEach(function(t){
    var se=tripStartEnd(t.trip_id);
    if(!se) return;
    var duration=Math.max(0,se.arrival-se.departure);
    var freqs=getFreqsForTrips([t]);
    if(freqs.length){
      freqs.forEach(function(f){
        var start=timeToSecs(f.start_time), end=timeToSecs(f.end_time), step=Math.max(1,csvNum(f.headway_secs,0));
        for(var s=start; s<end; s+=step){
          var key=t.trip_id+'|'+s+'|'+tripDir(t);
          if(seen[key]) continue; seen[key]=true;
          out.push({trip:t, dir:tripDir(t), departure:s, arrival:s+duration, headsign:t.trip_headsign||'', source:'frecuencia'});
        }
      });
    }else{
      var key=t.trip_id+'|'+se.departure+'|'+tripDir(t);
      if(!seen[key]){
        seen[key]=true;
        out.push({trip:t, dir:tripDir(t), departure:se.departure, arrival:se.arrival, headsign:t.trip_headsign||'', source:'programada'});
      }
    }
  });
  return out.sort(function(a,b){return a.departure-b.departure || a.arrival-b.arrival || String(a.trip.trip_id).localeCompare(String(b.trip.trip_id));});
}
function renderDeparturesTable(){
  var w=document.getElementById('stops-table-wrap');
  if(!w) return;
  var routeId=document.getElementById('sel-route').value, svcId=document.getElementById('sel-service').value;
  var departures=routeDepartures(routeId, svcId, curStopsDir);
  var summary=document.getElementById('departures-summary');
  if(summary) summary.textContent=departures.length+' salidas · '+dirName(curStopsDir)+' · '+serviceLabel(svcId);
  if(!departures.length){w.innerHTML='<div class="no-data">Sin salidas para este recorrido, sentido y tipo de día.</div>';return;}
  var route=DATA.routes[routeId]||{}, routeShort=route.route_short_name||route.route_id||'';
  var rows=departures.map(function(d,i){
    var duration=Math.max(0,d.arrival-d.departure), mins=Math.round(duration/60);
    return '<tr><td style="color:#999;font-size:12px">'+(i+1)+'</td><td><span class="route-badge" style="background:'+rColor(route)+';color:'+rText(route)+'">'+esc(routeShort)+'</span></td><td>'+esc(dirName(d.dir))+'</td><td style="font-weight:600">'+secsToTime(d.departure)+'</td><td style="font-weight:600">'+secsToTime(d.arrival)+'</td><td>'+mins+' min</td><td>'+esc(d.headsign||'—')+'</td></tr>';
  }).join('');
  w.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Recorrido</th><th>Sentido</th><th>Sale</th><th>Llega</th><th>Duración</th><th>Destino</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function renderStopsTable(){ renderDeparturesTable(); }


function initStopMap(){
  if(stopLeafMap) return;
  stopLeafMap=L.map('stop-map',{zoomControl:false,preferCanvas:true}).setView([-33.45,-70.65],15);
  addInstitutionalTiles(stopLeafMap,19);
  L.control.zoom({position:'topright'}).addTo(stopLeafMap);
}
function renderStopMap(stopId){
  if(!stopId) return;
  var stop=DATA.stops[stopId];
  if(!stop||stop.stop_lat===null||stop.stop_lon===null){
    initStopMap();
    if(stopMarker){stopLeafMap.removeLayer(stopMarker);stopMarker=null;}
    fitSantiago(stopLeafMap);
    L.popup().setLatLng([-33.45,-70.65]).setContent('Este paradero no tiene una ubicación válida.').openOn(stopLeafMap);
    return;
  }
  initStopMap();
  stopLeafMap.closePopup();
  var lat=+stop.stop_lat,lon=+stop.stop_lon,name=cleanName(stop.stop_name||stopId);
  if(stopMarker) stopLeafMap.removeLayer(stopMarker);
  stopMarker=L.circleMarker([lat,lon],{
    radius:11,fillColor:'#98251c',color:'#fff',weight:4,fillOpacity:1
  }).addTo(stopLeafMap).bindPopup(
    '<b>'+esc(name)+'</b><br><small>'+esc(stopId)+'</small><br><small>'+lat.toFixed(6)+', '+lon.toFixed(6)+'</small>'
  );
  stopLeafMap.setView([lat,lon],17);
  setTimeout(function(){stopLeafMap.invalidateSize();},60);
}

function setupStopSearch(){
  var inp=document.getElementById('stop-search'), sug=document.getElementById('suggestions');
  inp.addEventListener('input',function(){
    var q=inp.value.trim().toLowerCase(); if(q.length<2){sug.style.display='none';return;}
    var results=Object.values(DATA.stopIndex).filter(function(s){return s.key.indexOf(q)!==-1;}).slice(0,14);
    if(!results.length){sug.style.display='none';return;}
    sug.innerHTML=results.map(function(s){ return '<div class="sug-item" onclick="selectStop(\''+esc(String(s.s.stop_id)).replace(/&#39;/g,"\\'")+'\')">'+esc(s.name)+'<small>'+esc(s.s.stop_id)+'</small></div>'; }).join('');
    sug.style.display='block';
  });
  document.addEventListener('click',function(e){if(!e.target.closest('.search-wrap'))sug.style.display='none';});
}
function selectStop(stopId){
  document.getElementById('suggestions').style.display='none';
  var stop=DATA.stops[stopId]; if(!stop)return;
  document.getElementById('stop-search').value=cleanName(stop.stop_name||stopId);
  activeStop=stopId; updateStopServiceOptions(stopId); renderStop(stopId);
  document.getElementById('stop-detail').style.display='block'; document.getElementById('stop-hint').style.display='none';
  var panel=document.getElementById('tab-paradero');
  var sheet=panel?panel.querySelector('.details-sheet'):null;
  if(sheet) sheet.classList.add('is-open');
}
function computeArrivals(stopId, svcId){
  var entries=(DATA.stopTrips[stopId]||[]).filter(function(e){ var trip=DATA.trips[e.trip_id];return trip&&trip.service_id===svcId; });
  var arrivals=[];
  var MAX_ARRIVALS=25000;
  entries.forEach(function(e){
    if(arrivals.length>=MAX_ARRIVALS) return;
    var trip=DATA.trips[e.trip_id]; if(!trip)return;
    var route=DATA.routes[trip.route_id], freqs=(DATA.frequenciesByTrip && DATA.frequenciesByTrip[e.trip_id]) || DATA.frequencies.filter(function(f){return f.trip_id===e.trip_id;});
    if(freqs.length){
      freqs.forEach(function(f){
        if(arrivals.length>=MAX_ARRIVALS) return;
        var startS=timeToSecs(f.start_time), endS=timeToSecs(f.end_time), hw=f.headway_secs; if(hw<=0)return;
        for(var t=startS+e.offset;t<endS+e.offset && arrivals.length<MAX_ARRIVALS;t+=hw){
          var h=Math.floor(t/3600);
          if(h>=0&&h<=27) arrivals.push({timeSecs:t,timeStr:secsToTime(t),hour:h%24,headsign:trip.trip_headsign||trip.trip_short_name||'—',route:route,routeShort:route?route.route_short_name:'?',dir:tripDir(trip)});
        }
      });
    } else {
      var row=e.stopTime;
      var t=timeToSecs(row.departure_time||row.arrival_time||'0:00:00'), h=Math.floor(t/3600);
      if(h>=0&&h<=27) arrivals.push({timeSecs:t,timeStr:secsToTime(t),hour:h%24,headsign:trip.trip_headsign||trip.trip_short_name||'—',route:route,routeShort:route?route.route_short_name:'?',dir:tripDir(trip)});
    }
  });
  arrivals.sort(function(a,b){return a.timeSecs-b.timeSecs;});
  return arrivals;
}
function renderStop(stopId){
  var stop=DATA.stops[stopId]||{};
  var svcId=document.getElementById('sel-service-stop').value;
  var name=cleanName(stop.stop_name||stopId);
  var level=stop.level_id&&DATA.levels[stop.level_id]?DATA.levels[stop.level_id].level_name:'';
  var pathCount=(DATA.pathwaysByStop[stopId]||[]).length;
  var meta=esc(stopId)+(stop.stop_lat!==null?' &nbsp;·&nbsp; '+(+stop.stop_lat).toFixed(5)+', '+(+stop.stop_lon).toFixed(5):'')+
    (level?' &nbsp;·&nbsp; '+esc(level):'')+(pathCount?' &nbsp;·&nbsp; '+pathCount+' conexiones peatonales':'');
  document.getElementById('stop-header-info').innerHTML=
    '<div class="stop-pin">●</div><div><div class="stop-name-big">'+esc(name)+'</div><div class="stop-id-small">'+meta+'</div></div>';

  renderStopMap(stopId);
  var opFilter=document.getElementById('sel-operator-stop').value;
  var entries=(DATA.stopTrips[stopId]||[]).filter(function(e){
    var t=DATA.trips[e.trip_id],r=t?DATA.routes[t.route_id]:null;
    return t&&t.service_id===svcId&&routeMatchesOperator(r,opFilter);
  });

  _cachedArrivals=computeArrivals(stopId,svcId).filter(function(a){return routeMatchesOperator(a.route,opFilter);});
  var routeMap={};
  _cachedArrivals.forEach(function(a){
    var rid=a.route&&a.route.route_id?String(a.route.route_id):String(a.routeShort||'?');
    if(!routeMap[rid]) routeMap[rid]={route:a.route,headsigns:{},dirs:{},count:0};
    routeMap[rid].count++;
    if(a.headsign) routeMap[rid].headsigns[a.headsign]=true;
    routeMap[rid].dirs[dirName(a.dir)]=true;
  });

  var hourly=[];
  for(var h=0;h<24;h++) hourly.push(_cachedArrivals.filter(function(a){return a.hour===h;}).length);
  var peakCount=Math.max.apply(null,[0].concat(hourly));
  var peakHour=hourly.indexOf(peakCount);
  var first=_cachedArrivals.length?_cachedArrivals[0].timeSecs:null;
  var last=_cachedArrivals.length?_cachedArrivals[_cachedArrivals.length-1].timeSecs:null;
  var kpis=document.getElementById('stop-kpis');
  if(kpis){
    kpis.innerHTML=
      metricCard('Recorridos',Object.keys(routeMap).length.toLocaleString('es-CL'),'servicios distintos')+
      metricCard('Llegadas estimadas',_cachedArrivals.length.toLocaleString('es-CL'),serviceLabel(svcId))+
      metricCard('Hora punta',peakCount?String(peakHour).padStart(2,'0')+':00':'—',peakCount?peakCount+' llegadas':'sin programación')+
      metricCard('Ventana de atención',first===null?'—':secsToTime(first)+'–'+secsToTime(last),'primera a última llegada');
  }

  if(!entries.length||!_cachedArrivals.length){
    document.getElementById('routes-at-stop-wrap').innerHTML='<div class="no-data">Sin recorridos para este tipo de día.</div>';
    document.getElementById('arrivals-wrap').innerHTML='<div class="no-data">Sin llegadas programadas.</div>';
    renderStopChart([]);
    return;
  }

  var routesSorted=Object.values(routeMap).sort(function(a,b){
    return b.count-a.count||String(a.route?a.route.route_short_name:'').localeCompare(String(b.route?b.route.route_short_name:''),undefined,{numeric:true});
  });
  var showOperator=DATA.decoCompatible;
  var tableRows=routesSorted.map(function(rm){
    var r=rm.route,bg=rColor(r),tc=rText(r),hs=Object.keys(rm.headsigns).slice(0,3).join(' / ')||'—';
    var cells='<td><span class="route-badge" style="background:'+bg+';color:'+tc+'">'+esc(r?r.route_short_name:'?')+'</span></td>';
    if(showOperator) cells+='<td>'+esc(routeOperator(r))+'</td>';
    cells+='<td>'+esc(Object.keys(rm.dirs).join(' / '))+'</td><td>'+esc(hs)+'</td><td><b>'+rm.count+'</b></td>';
    return '<tr>'+cells+'</tr>';
  }).join('');
  var head='<th>Ruta</th>'+(showOperator?'<th>Operador</th>':'')+'<th>Sentido</th><th>Destino</th><th>Llegadas/día</th>';
  document.getElementById('routes-at-stop-wrap').innerHTML='<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+tableRows+'</tbody></table></div>';
  renderStopChart(_cachedArrivals);
  renderArrivals(_cachedArrivals);
}
function renderStopChart(arrivals){
  var labels=[],values=[];
  for(var h=0;h<24;h++){
    labels.push(String(h).padStart(2,'0')+'h');
    values.push(arrivals.filter(function(a){return a.hour===h;}).length);
  }
  var canvas=document.getElementById('stop-chart');
  if(!canvas) return;
  if(stopChart) stopChart.destroy();
  stopChart=new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{labels:labels,datasets:[{
      label:'Llegadas',data:values,borderColor:'rgba(152,37,28,.9)',backgroundColor:'rgba(152,37,28,.1)',
      fill:true,tension:.25,pointRadius:2,pointHoverRadius:4,borderWidth:2
    }]},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        y:{beginAtZero:true,title:{display:true,text:'llegadas'},ticks:{precision:0},grid:{color:'rgba(23,32,39,.06)'}},
        x:{grid:{display:false},ticks:{font:{size:9},maxRotation:0}}
      }
    }
  });
}
function renderArrivals(arrivals){
  var hour=selectedHour%24;
  var filtered=arrivals.filter(function(a){return a.hour===hour;});
  document.getElementById('arrivals-title').textContent='Llegadas entre '+String(hour).padStart(2,'0')+':00 y '+String((hour+1)%24).padStart(2,'0')+':00 · '+filtered.length;
  var wrap=document.getElementById('arrivals-wrap');
  if(!filtered.length){
    wrap.innerHTML='<div class="no-data">No hay buses programados en esta franja.</div>';
    return;
  }
  var show=filtered.slice(0,180),showOperator=DATA.decoCompatible;
  var rows=show.map(function(a){
    var bg=rColor(a.route),tc=rText(a.route);
    var cells='<td><b>'+a.timeStr+'</b></td><td><span class="route-badge" style="background:'+bg+';color:'+tc+'">'+esc(a.routeShort)+'</span></td>';
    if(showOperator) cells+='<td>'+esc(routeOperator(a.route))+'</td>';
    cells+='<td>'+esc(dirName(a.dir))+'</td><td>'+esc(a.headsign)+'</td>';
    return '<tr>'+cells+'</tr>';
  }).join('');
  var columns=showOperator?5:4;
  var more=filtered.length>show.length?'<tr><td colspan="'+columns+'" class="no-data">… y '+(filtered.length-show.length)+' llegadas adicionales</td></tr>':'';
  var head='<th>Hora</th><th>Ruta</th>'+(showOperator?'<th>Operador</th>':'')+'<th>Sentido</th><th>Destino</th>';
  wrap.innerHTML='<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+rows+more+'</tbody></table></div>';
}
function onHourSlide(v){
  selectedHour=parseInt(v,10)||0;
  document.getElementById('hour-val').textContent=String(selectedHour%24).padStart(2,'0')+':00';
  renderArrivals(_cachedArrivals);
}




async function parseGTFSForCompare(file){
  var zip = await JSZip.loadAsync(file);
  async function readTxt(name){ var f=zip.file(name); return f?await f.async('string'):''; }
  function parse(txt){ return txt ? Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false}).data : []; }
  var out={routes:{},routesByShort:{},trips:{},tripsByRoute:{},stops:{},stopTimes:{},frequencies:[],calendar:{},serviceIds:[]};
  parse(await readTxt('calendar.txt')).forEach(function(c){ if(c.service_id) out.calendar[String(c.service_id)]=c; });
  parse(await readTxt('routes.txt')).forEach(function(r){
    var rid=String(r.route_id||''); if(!rid) return; r.route_id=rid; out.routes[rid]=r;
    var key=normalizeRouteCode(r.route_short_name||rid); if(key && !out.routesByShort[key]) out.routesByShort[key]=r;
  });
  parse(await readTxt('trips.txt')).forEach(function(t){
    var tid=String(t.trip_id||''); if(!tid) return;
    t.trip_id=tid; t.route_id=String(t.route_id||''); t.service_id=String(t.service_id||''); t.direction_id=String(t.direction_id==null||t.direction_id===''?0:t.direction_id);
    out.trips[tid]=t;
    if(!out.tripsByRoute[t.route_id]) out.tripsByRoute[t.route_id]=[];
    out.tripsByRoute[t.route_id].push(t);
  });
  parse(await readTxt('stops.txt')).forEach(function(st){
    var sid=String(st.stop_id||''); if(!sid) return;
    st.stop_id=sid; st.stop_lat=csvNum(st.stop_lat,null); st.stop_lon=csvNum(st.stop_lon,null); out.stops[sid]=st;
  });
  parse(await readTxt('stop_times.txt')).forEach(function(row){
    var tid=String(row.trip_id||''); if(!tid) return;
    row.trip_id=tid; row.stop_id=String(row.stop_id||''); row.stop_sequence=csvNum(row.stop_sequence);
    if(!out.stopTimes[tid]) out.stopTimes[tid]=[];
    out.stopTimes[tid].push(row);
  });
  Object.keys(out.stopTimes).forEach(function(tid){ out.stopTimes[tid].sort(function(a,b){return a.stop_sequence-b.stop_sequence;}); });
  out.frequencies=parse(await readTxt('frequencies.txt')).map(function(f){
    f.trip_id=String(f.trip_id||''); f.headway_secs=csvNum(f.headway_secs); f.start_time=String(f.start_time||''); f.end_time=String(f.end_time||''); return f;
  });
  out.serviceIds=unique(Object.values(out.trips).map(function(t){return t.service_id;})).sort(sortServices);
  return out;
}
function currentGTFSForCompare(){
  var out={routes:DATA.routes,routesByShort:{},trips:DATA.trips,tripsByRoute:DATA.tripsByRoute,stops:DATA.stops,stopTimes:DATA.stopTimes,frequencies:DATA.frequencies,calendar:DATA.calendar,serviceIds:DATA.serviceIds};
  Object.values(DATA.routes).forEach(function(r){ var key=normalizeRouteCode(r.route_short_name||r.route_id); if(key && !out.routesByShort[key]) out.routesByShort[key]=r; });
  return out;
}
function normalizeRouteCode(v){ return String(v||'').trim().replace(/\s+/g,'').replace(/\.0+$/,'').toLowerCase(); }
function displayRouteCode(route, key){ return route ? String(route.route_short_name||route.route_id||key) : String(key||'—'); }
function routeLong(route){ return route ? String(route.route_long_name||'') : ''; }
function serviceLabelForFeed(feed, sid){
  if(SVC[sid]) return SVC[sid];
  var c = feed.calendar ? feed.calendar[sid] : null;
  if(c){
    var flags = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(function(k){return String(c[k])==='1'||c[k]===1;});
    var active = flags.map(function(v,i){return v?DAY_NAMES[i]:null;}).filter(Boolean);
    if(active.length===5 && flags.slice(0,5).every(Boolean) && !flags[5] && !flags[6]) return 'Lunes a Viernes';
    if(active.length===7) return 'Todos los días';
    if(active.length) return active.join(', ');
  }
  return sid || '—';
}
function stopNameForFeed(feed, stopId){ var st=feed.stops[stopId]||{}; return cleanName(st.stop_name||stopId); }
function routeTrips(feed, route){ return route ? (feed.tripsByRoute[String(route.route_id)]||[]) : []; }
function routeTripsCount(feed, route){ return routeTrips(feed,route).length; }
function routeServicesForFeed(feed, route){ return unique(routeTrips(feed,route).map(function(t){return t.service_id;})).sort(sortServices); }
function routeDirsForFeed(feed, route){ return unique(routeTrips(feed,route).map(function(t){return tripDir(t);})).sort(); }
function routeStopSeqsByDir(feed, route){
  var out={};
  routeTrips(feed,route).forEach(function(t){
    var d=tripDir(t);
    if(out[d]) return;
    var st=feed.stopTimes[t.trip_id]||[];
    if(st.length) out[d]=st.map(function(x){return x.stop_id;});
  });
  return out;
}
function routeStopSignature(feed, route){
  var byDir=routeStopSeqsByDir(feed,route);
  return Object.keys(byDir).sort().map(function(k){return k+':'+byDir[k].join('>');}).join('|');
}
function avgHeadwayForRoute(feed, route){
  if(!route) return null;
  var trips=routeTrips(feed,route), ids={}; trips.forEach(function(t){ids[t.trip_id]=true;});
  var freqs=(feed.frequencies||[]).filter(function(f){return ids[f.trip_id]&&f.headway_secs>0;});
  if(freqs.length) return Math.round(freqs.reduce(function(a,f){return a+f.headway_secs;},0)/freqs.length/60);
  var starts=[]; trips.forEach(function(t){ var st=feed.stopTimes[t.trip_id]; if(st&&st.length) starts.push(timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00')); });
  starts.sort(function(a,b){return a-b;}); if(starts.length<2) return null;
  var diffs=[]; for(var i=1;i<starts.length;i++){ if(starts[i]-starts[i-1]>0) diffs.push(starts[i]-starts[i-1]); }
  return diffs.length?Math.round(diffs.reduce(function(a,b){return a+b;},0)/diffs.length/60):null;
}
function stopDeltaDetails(oldFeed, newFeed, oldR, newR){
  var oldSeqs=routeStopSeqsByDir(oldFeed,oldR), newSeqs=routeStopSeqsByDir(newFeed,newR), details=[];
  var dirs=unique(Object.keys(oldSeqs).concat(Object.keys(newSeqs))).sort();
  dirs.forEach(function(d){
    var oldSeq=(oldSeqs[d]||[]).filter(isComparableStopId);
    var newSeq=(newSeqs[d]||[]).filter(isComparableStopId);
    if(oldSeq.join('>')===newSeq.join('>')) return;
    var oldSet={}, newSet={}; oldSeq.forEach(function(x){oldSet[x]=true;}); newSeq.forEach(function(x){newSet[x]=true;});
    var added=newSeq.filter(function(x){return !oldSet[x];}).length;
    var removed=oldSeq.filter(function(x){return !newSet[x];}).length;
    var oldFirst=oldSeq.length?stopNameForFeed(oldFeed,oldSeq[0]):'—';
    var newFirst=newSeq.length?stopNameForFeed(newFeed,newSeq[0]):'—';
    var oldLast=oldSeq.length?stopNameForFeed(oldFeed,oldSeq[oldSeq.length-1]):'—';
    var newLast=newSeq.length?stopNameForFeed(newFeed,newSeq[newSeq.length-1]):'—';
    var txt=dirName(d)+': '+oldSeq.length+' → '+newSeq.length+' paraderos PA–PJ con 1 a 4 dígitos';
    if(added||removed) txt+=' ('+added+' nuevos, '+removed+' eliminados)';
    if(oldFirst!==newFirst || oldLast!==newLast) txt+='; inicio '+oldFirst+' → '+newFirst+'; término '+oldLast+' → '+newLast;
    details.push(txt);
  });
  return details;
}

function routeStopDeltaMetrics(oldFeed, newFeed, oldR, newR){
  var oldSeqs=routeStopSeqsByDir(oldFeed,oldR), newSeqs=routeStopSeqsByDir(newFeed,newR);
  var dirs=unique(Object.keys(oldSeqs).concat(Object.keys(newSeqs))).sort();
  var result={added:0,removed:0,reordered:0,directionsChanged:0};
  dirs.forEach(function(d){
    var oldSeq=(oldSeqs[d]||[]).filter(isComparableStopId);
    var newSeq=(newSeqs[d]||[]).filter(isComparableStopId);
    if(oldSeq.join('>')===newSeq.join('>')) return;
    result.directionsChanged++;
    var oldSet={}, newSet={};
    oldSeq.forEach(function(x){oldSet[x]=true;});
    newSeq.forEach(function(x){newSet[x]=true;});
    var added=newSeq.filter(function(x){return !oldSet[x];}).length;
    var removed=oldSeq.filter(function(x){return !newSet[x];}).length;
    result.added+=added;
    result.removed+=removed;
    if(oldSeq.length===newSeq.length && added===0 && removed===0) result.reordered++;
  });
  return result;
}
function pctDelta(oldValue,newValue){
  if(!oldValue) return newValue===oldValue?0:null;
  return ((newValue-oldValue)/oldValue)*100;
}
function compareChangeProfile(oldFeed,newFeed,oldR,newR,oldTrips,newTrips,oldHw,newHw){
  var stopMetrics=routeStopDeltaMetrics(oldFeed,newFeed,oldR,newR);
  var oldSvc=routeServicesForFeed(oldFeed,oldR), newSvc=routeServicesForFeed(newFeed,newR);
  var oldDirs=routeDirsForFeed(oldFeed,oldR), newDirs=routeDirsForFeed(newFeed,newR);
  var metadataChanged=routeLong(oldR)!==routeLong(newR) || String(oldR.route_color||'')!==String(newR.route_color||'');
  var serviceChanged=oldSvc.join('|')!==newSvc.join('|') || oldDirs.join('|')!==newDirs.join('|');
  var tripPct=pctDelta(oldTrips,newTrips);
  var freqPct=(oldHw!==null && newHw!==null)?pctDelta(oldHw,newHw):null;
  var types=[];
  if(stopMetrics.added || stopMetrics.removed || stopMetrics.reordered || stopMetrics.directionsChanged) types.push('stops');
  if(oldTrips!==newTrips) types.push('trips');
  if(oldHw!==null && newHw!==null && oldHw!==newHw) types.push('frequency');
  if(serviceChanged) types.push('service');
  if(metadataChanged) types.push('metadata');
  var score=(stopMetrics.added+stopMetrics.removed)*2 +
    (stopMetrics.reordered?3:0) +
    (tripPct===null?0:Math.abs(tripPct)/10) +
    (freqPct===null?0:Math.abs(freqPct)/10) +
    (serviceChanged?2:0) +
    (metadataChanged?1:0);
  score=Math.round(score*10)/10;
  return {
    stopMetrics:stopMetrics,
    tripDelta:newTrips-oldTrips,
    tripPct:tripPct,
    headwayDelta:(oldHw!==null && newHw!==null)?newHw-oldHw:null,
    freqPct:freqPct,
    types:types,
    score:score,
    impact:score>=12?'Alto':score>=5?'Medio':'Bajo'
  };
}
function isComparableStopId(id){
  return /^P[A-J]\d{1,4}$/.test(String(id||'').trim());
}
function signedNumber(value,suffix){
  if(value===null || value===undefined || isNaN(value)) return '—';
  var rounded=Math.round(value*10)/10;
  return (rounded>0?'+':'')+rounded+(suffix||'');
}

function routeChangeDetails(oldFeed, newFeed, oldR, newR){
  var details=[];
  if(routeLong(oldR)!==routeLong(newR)) details.push('Nombre largo: '+(routeLong(oldR)||'—')+' → '+(routeLong(newR)||'—'));
  if(String(oldR.route_color||'')!==String(newR.route_color||'')) details.push('Color: '+(oldR.route_color||'—')+' → '+(newR.route_color||'—'));
  var oldTrips=routeTripsCount(oldFeed,oldR), newTrips=routeTripsCount(newFeed,newR);
  if(oldTrips!==newTrips) details.push('Viajes diarios/base: '+oldTrips+' → '+newTrips+' ('+(newTrips-oldTrips>0?'+':'')+(newTrips-oldTrips)+')');
  var oldSvc=routeServicesForFeed(oldFeed,oldR), newSvc=routeServicesForFeed(newFeed,newR);
  if(oldSvc.join('|')!==newSvc.join('|')) details.push('Tipos de día: '+oldSvc.map(function(s){return serviceLabelForFeed(oldFeed,s);}).join(', ')+' → '+newSvc.map(function(s){return serviceLabelForFeed(newFeed,s);}).join(', '));
  var oldDirs=routeDirsForFeed(oldFeed,oldR).map(dirName), newDirs=routeDirsForFeed(newFeed,newR).map(dirName);
  if(oldDirs.join('|')!==newDirs.join('|')) details.push('Sentidos: '+oldDirs.join(', ')+' → '+newDirs.join(', '));
  details=details.concat(stopDeltaDetails(oldFeed,newFeed,oldR,newR));
  var oldHw=avgHeadwayForRoute(oldFeed,oldR), newHw=avgHeadwayForRoute(newFeed,newR);
  if(oldHw!==null && newHw!==null && Math.abs(newHw-oldHw)>=1) details.push('Frecuencia promedio general: '+oldHw+' → '+newHw+' min');
  return details;
}
function frequencyProfile(feed){
  var byTrip={};
  Object.values(feed.trips).forEach(function(t){ byTrip[t.trip_id]=t; });
  var grouped={};
  (feed.frequencies||[]).forEach(function(f){
    var t=byTrip[f.trip_id]; if(!t || !f.headway_secs) return;
    var r=feed.routes[t.route_id]; if(!r) return;
    var rKey=normalizeRouteCode(r.route_short_name||r.route_id);
    var key=[rKey,t.service_id,tripDir(t),String(f.start_time||''),String(f.end_time||'')].join('|');
    if(!grouped[key]) grouped[key]={routeKey:rKey,route:r,serviceId:t.service_id,dir:tripDir(t),start:f.start_time,end:f.end_time,total:0,count:0};
    grouped[key].total+=f.headway_secs; grouped[key].count++;
  });
  var out={};
  Object.keys(grouped).forEach(function(k){ var g=grouped[k]; g.headwayMin=Math.round((g.total/g.count)/60); out[k]=g; });
  return out;
}
function compareFrequencyWindows(oldFeed,newFeed){
  var oldP=frequencyProfile(oldFeed), newP=frequencyProfile(newFeed), changes=[];
  Object.keys(newP).forEach(function(k){
    if(!oldP[k]) return;
    var oldH=oldP[k].headwayMin, newH=newP[k].headwayMin;
    if(oldH!==newH) changes.push({key:k, routeKey:newP[k].routeKey, route:newP[k].route, serviceId:newP[k].serviceId, day:serviceLabelForFeed(newFeed,newP[k].serviceId), dir:newP[k].dir, start:newP[k].start, end:newP[k].end, oldHw:oldH, newHw:newH, delta:newH-oldH});
  });
  changes.sort(function(a,b){return Math.abs(b.delta)-Math.abs(a.delta);});
  return changes;
}
function compareFeeds(oldFeed, newFeed){
  var oldKeys=Object.keys(oldFeed.routesByShort), newKeys=Object.keys(newFeed.routesByShort);
  var oldSet={},newSet={}; oldKeys.forEach(function(k){oldSet[k]=true;}); newKeys.forEach(function(k){newSet[k]=true;});
  var created=newKeys.filter(function(k){return !oldSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var deleted=oldKeys.filter(function(k){return !newSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var common=newKeys.filter(function(k){return oldSet[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var freqChanges=compareFrequencyWindows(oldFeed,newFeed);
  var freqByRoute={};
  freqChanges.forEach(function(f){
    if(!freqByRoute[f.routeKey]) freqByRoute[f.routeKey]=[];
    freqByRoute[f.routeKey].push(f);
  });
  var modified=[];
  common.forEach(function(k){
    var oldR=oldFeed.routesByShort[k], newR=newFeed.routesByShort[k];
    var details=routeChangeDetails(oldFeed,newFeed,oldR,newR);
    var routeFreq=freqByRoute[k]||[];
    if(routeFreq.length){
      var maxFreq=Math.max.apply(null,routeFreq.map(function(f){return Math.abs(f.delta);}));
      details.push('Frecuencia por franja: '+routeFreq.length+' ventana(s) cambiada(s), máximo '+maxFreq+' min');
    }
    if(details.length){
      var oldTrips=routeTripsCount(oldFeed,oldR), newTrips=routeTripsCount(newFeed,newR);
      var oldHw=avgHeadwayForRoute(oldFeed,oldR), newHw=avgHeadwayForRoute(newFeed,newR);
      var profile=compareChangeProfile(oldFeed,newFeed,oldR,newR,oldTrips,newTrips,oldHw,newHw);
      if(routeFreq.length && profile.types.indexOf('frequency')===-1) profile.types.push('frequency');
      if(routeFreq.length){
        profile.freqWindowCount=routeFreq.length;
        profile.maxWindowDelta=Math.max.apply(null,routeFreq.map(function(f){return Math.abs(f.delta);}));
        profile.score=Math.round((profile.score+profile.maxWindowDelta+Math.min(5,routeFreq.length/2))*10)/10;
        profile.impact=profile.score>=12?'Alto':profile.score>=5?'Medio':'Bajo';
      }
      modified.push({
        key:k,
        oldRoute:oldR,
        route:newR,
        details:details,
        oldTrips:oldTrips,
        newTrips:newTrips,
        oldHw:oldHw,
        newHw:newHw,
        profile:profile
      });
    }
  });
  var oldStops={}, newStops={};
  Object.keys(oldFeed.stops).filter(isComparableStopId).forEach(function(k){oldStops[k]=true;});
  Object.keys(newFeed.stops).filter(isComparableStopId).forEach(function(k){newStops[k]=true;});
  var stopsCreated=Object.keys(newStops).filter(function(k){return !oldStops[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  var stopsDeleted=Object.keys(oldStops).filter(function(k){return !newStops[k];}).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true});});
  return {created:created,deleted:deleted,modified:modified,freqChanges:freqChanges,stopsCreated:stopsCreated,stopsDeleted:stopsDeleted};
}
function tableFromRows(headers, rows){
  if(!rows.length) return '<div class="no-data">Sin cambios detectados</div>';
  return '<div class="tbl-wrap"><table><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}

var COMPARE_STATE={cmp:null,oldFeed:null,newFeed:null};

function frequencyChangesByRoute(changes){
  var grouped={};
  (changes||[]).forEach(function(f){
    var key=f.routeKey;
    if(!grouped[key]) grouped[key]={routeKey:key,route:f.route,items:[],improvements:0,worsenings:0,totalDelta:0,maxAbsDelta:0};
    var g=grouped[key];
    g.items.push(f);
    g.totalDelta+=f.delta;
    g.maxAbsDelta=Math.max(g.maxAbsDelta,Math.abs(f.delta));
    if(f.delta<0) g.improvements++; else if(f.delta>0) g.worsenings++;
  });
  return Object.keys(grouped).map(function(k){
    var g=grouped[k];
    g.avgDelta=g.items.length?g.totalDelta/g.items.length:0;
    g.trend=g.improvements && g.worsenings?'Mixto':g.improvements?'Mejora':'Empeora';
    g.score=g.maxAbsDelta*2+g.items.length;
    return g;
  });
}
function impactClass(impact){
  return impact==='Alto'?'compare-impact-high':impact==='Medio'?'compare-impact-mid':'compare-impact-low';
}
function typeLabel(type){
  return ({stops:'Trazado',frequency:'Frecuencia',trips:'Viajes',service:'Días/sentidos',metadata:'Datos'})[type]||type;
}
function formatPct(value){
  return value===null || value===undefined || isNaN(value)?'—':signedNumber(value,'%');
}
function renderCompareAnalysis(){
  var state=COMPARE_STATE, cmp=state.cmp;
  if(!cmp) return;
  var searchEl=document.getElementById('compare-route-search');
  var filterEl=document.getElementById('compare-change-filter');
  var sortEl=document.getElementById('compare-sort');
  var q=normalizeRouteCode(searchEl?searchEl.value:'');
  var filter=filterEl?filterEl.value:'all';
  var sort=sortEl?sortEl.value:'impact';
  var rows=cmp.modified.filter(function(m){
    var hay=normalizeRouteCode(displayRouteCode(m.route,m.key)+' '+routeLong(m.route));
    if(q && hay.indexOf(q)===-1) return false;
    return filter==='all' || m.profile.types.indexOf(filter)!==-1;
  });
  rows.sort(function(a,b){
    if(sort==='route') return displayRouteCode(a.route,a.key).localeCompare(displayRouteCode(b.route,b.key),undefined,{numeric:true});
    if(sort==='frequency') return Math.abs(b.profile.headwayDelta||0)-Math.abs(a.profile.headwayDelta||0) || b.profile.score-a.profile.score;
    if(sort==='trips') return Math.abs(b.profile.tripDelta||0)-Math.abs(a.profile.tripDelta||0) || b.profile.score-a.profile.score;
    return b.profile.score-a.profile.score || displayRouteCode(a.route,a.key).localeCompare(displayRouteCode(b.route,b.key),undefined,{numeric:true});
  });
  document.getElementById('routes-modified-wrap').innerHTML=tableFromRows(
    ['Ruta','Impacto','Δ viajes','Δ frecuencia','Paraderos','Análisis'],
    rows.slice(0,150).map(function(m){
      var p=m.profile, sm=p.stopMetrics;
      var tags=p.types.map(function(t){return '<span class="operator-chip">'+esc(typeLabel(t))+'</span>';}).join(' ');
      var detail='<details class="compare-detail"><summary>Ver '+m.details.length+' cambios</summary><ul>'+
        m.details.map(function(d){return '<li>'+esc(d)+'</li>';}).join('')+
        '</ul><div class="param-sheet-note">Índice: '+p.score+' · Viajes '+formatPct(p.tripPct)+' · Frecuencia '+formatPct(p.freqPct)+'</div></details>';
      return '<tr>'+
        '<td><b>'+esc(displayRouteCode(m.route,m.key))+'</b><br><small>'+esc(routeLong(m.route)||'—')+'</small><br>'+tags+'</td>'+
        '<td><span class="compare-impact '+impactClass(p.impact)+'">'+p.impact+' · '+p.score+'</span></td>'+
        '<td class="compare-metric">'+signedNumber(p.tripDelta,'')+'<br><small>'+formatPct(p.tripPct)+'</small></td>'+
        '<td class="compare-metric">'+signedNumber(p.headwayDelta,' min')+'<br><small>'+formatPct(p.freqPct)+'</small></td>'+
        '<td class="compare-metric">+'+sm.added+' / −'+sm.removed+(sm.reordered?'<br><small>'+sm.reordered+' reordenado(s)</small>':'')+'</td>'+
        '<td>'+detail+'</td>'+
      '</tr>';
    })
  );
  var freqRows=frequencyChangesByRoute(cmp.freqChanges).filter(function(g){
    if(!q) return true;
    return normalizeRouteCode(displayRouteCode(g.route,g.routeKey)+' '+routeLong(g.route)).indexOf(q)!==-1;
  });
  freqRows.sort(function(a,b){return b.score-a.score || displayRouteCode(a.route,a.routeKey).localeCompare(displayRouteCode(b.route,b.routeKey),undefined,{numeric:true});});
  document.getElementById('freq-changes-wrap').innerHTML=tableFromRows(
    ['Ruta','Ventanas','Tendencia','Δ promedio','Máximo cambio','Detalle'],
    freqRows.slice(0,120).map(function(g){
      var trendClass=g.trend==='Mejora'?'delta-up':g.trend==='Empeora'?'delta-down':'delta-neutral';
      var detail='<details class="compare-detail"><summary>Ver franjas</summary><ul>'+
        g.items.slice(0,30).map(function(f){
          return '<li>'+esc(f.day)+' · '+esc(dirName(f.dir))+' · '+esc(String(f.start).slice(0,5))+'–'+esc(String(f.end).slice(0,5))+': '+f.oldHw+' → '+f.newHw+' min ('+signedNumber(f.delta,' min')+')</li>';
        }).join('')+
        '</ul></details>';
      return '<tr><td><b>'+esc(displayRouteCode(g.route,g.routeKey))+'</b><br><small>'+esc(routeLong(g.route)||'—')+'</small></td>'+
        '<td>'+g.items.length+'</td><td class="'+trendClass+'">'+g.trend+'<br><small>'+g.improvements+' mejora(s), '+g.worsenings+' empeora(s)</small></td>'+
        '<td class="compare-metric">'+signedNumber(g.avgDelta,' min')+'</td><td class="compare-metric">'+g.maxAbsDelta+' min</td><td>'+detail+'</td></tr>';
    })
  );
  var note=document.getElementById('compare-analysis-note');
  if(note){
    note.textContent='Mostrando '+rows.length+' de '+cmp.modified.length+' recorridos modificados, según los filtros seleccionados.';
  }
}

function renderCompare(cmp, oldFeed, newFeed){
  COMPARE_STATE={cmp:cmp,oldFeed:oldFeed,newFeed:newFeed};
  document.getElementById('compare-results').style.display='block';
  var comparePanel=document.getElementById('tab-comparar');
  var compareSheet=comparePanel?comparePanel.querySelector('.details-sheet'):null;
  if(compareSheet) compareSheet.classList.add('is-open');
  document.getElementById('compare-hint').style.display='none';
  var freqGroups=frequencyChangesByRoute(cmp.freqChanges);
  var improved=freqGroups.filter(function(g){return g.trend==='Mejora';}).length;
  var worsened=freqGroups.filter(function(g){return g.trend==='Empeora';}).length;
  document.getElementById('compare-summary').innerHTML=[
    ['Recorridos creados',cmp.created.length],
    ['Recorridos eliminados',cmp.deleted.length],
    ['Recorridos modificados',cmp.modified.length],
    ['Paraderos nuevos',cmp.stopsCreated.length],
    ['Paraderos eliminados',cmp.stopsDeleted.length],
    ['Recorridos con cambios de frecuencia',freqGroups.length],
    ['Frecuencia mejora',improved],
    ['Frecuencia empeora',worsened]
  ].map(function(x){return '<div class="stat-card"><div class="lbl">'+x[0]+'</div><div class="val">'+x[1]+'</div></div>';}).join('');
  document.getElementById('routes-created-wrap').innerHTML=tableFromRows(['Recorrido','Nombre','Viajes','Tipos de día','Frecuencia prom.'], cmp.created.map(function(k){
    var r=newFeed.routesByShort[k], hw=avgHeadwayForRoute(newFeed,r);
    return '<tr><td><b>'+esc(displayRouteCode(r,k))+'</b></td><td>'+esc(routeLong(r))+'</td><td>'+routeTripsCount(newFeed,r)+'</td><td>'+routeServicesForFeed(newFeed,r).map(function(s){return serviceLabelForFeed(newFeed,s);}).join(', ')+'</td><td>'+(hw?hw+' min':'—')+'</td></tr>';
  }));
  document.getElementById('routes-deleted-wrap').innerHTML=tableFromRows(['Recorrido','Nombre','Viajes','Tipos de día','Frecuencia prom.'], cmp.deleted.map(function(k){
    var r=oldFeed.routesByShort[k], hw=avgHeadwayForRoute(oldFeed,r);
    return '<tr><td><b>'+esc(displayRouteCode(r,k))+'</b></td><td>'+esc(routeLong(r))+'</td><td>'+routeTripsCount(oldFeed,r)+'</td><td>'+routeServicesForFeed(oldFeed,r).map(function(s){return serviceLabelForFeed(oldFeed,s);}).join(', ')+'</td><td>'+(hw?hw+' min':'—')+'</td></tr>';
  }));
  function stopRows(ids, feed){ return ids.slice(0,150).map(function(id){ var st=feed.stops[id]||{}; return '<tr><td><b>'+esc(id)+'</b></td><td>'+esc(cleanName(st.stop_name||''))+'</td><td>'+(st.stop_lat!==null?(+st.stop_lat).toFixed(5)+', '+(+st.stop_lon).toFixed(5):'—')+'</td></tr>'; }); }
  document.getElementById('stops-created-wrap').innerHTML=tableFromRows(['Código','Nombre','Coordenadas'], stopRows(cmp.stopsCreated,newFeed));
  document.getElementById('stops-deleted-wrap').innerHTML=tableFromRows(['Código','Nombre','Coordenadas'], stopRows(cmp.stopsDeleted,oldFeed));
  renderCompareAnalysis();
}
async function compareSelectedGTFS(){
  var baseSel=document.getElementById('compare-base-select'), targetSel=document.getElementById('compare-target-select');
  if(!baseSel || !targetSel || !baseSel.value || !targetSel.value){ alert('Selecciona dos fechas.'); return; }
  var baseName=baseSel.options[baseSel.selectedIndex].dataset.name || baseSel.options[baseSel.selectedIndex].textContent;
  var targetName=targetSel.options[targetSel.selectedIndex].dataset.name || targetSel.options[targetSel.selectedIndex].textContent;
  if(baseSel.value===targetSel.value){ alert('Selecciona dos fechas distintas para comparar.'); return; }
  document.getElementById('compare-hint').style.display='block';
  var baseLabel=baseSel.options[baseSel.selectedIndex].textContent;
  var targetLabel=targetSel.options[targetSel.selectedIndex].textContent;
  document.getElementById('compare-hint').textContent='Preparando comparación entre '+baseLabel+' y '+targetLabel+'…';
  document.getElementById('compare-results').style.display='none';
  try{
    var baseFile=await fetchGTFSFileFromURL(baseSel.value,baseName);
    var targetFile=await fetchGTFSFileFromURL(targetSel.value,targetName);
    var oldFeed=await parseGTFSForCompare(baseFile);
    var newFeed=await parseGTFSForCompare(targetFile);
    var cmp=compareFeeds(oldFeed,newFeed);
    document.getElementById('compare-hint').textContent='Comparación lista: '+baseLabel+' → '+targetLabel+'.';
    renderCompare(cmp, oldFeed, newFeed);
  }catch(err){
    console.error(err);
    document.getElementById('compare-hint').textContent='No se pudo comparar la información. Intenta nuevamente más tarde.';
  }
}


/* v2.0.0 — simulación GTFS y salidas por recorrido */
function setupSimulationSelectors(){
  fillOperatorSelect('sim-operator');
  var simR=document.getElementById('sim-route');
  if(!simR) return;
  simR.innerHTML='';
  Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0;})
    .sort(function(a,b){return String(a.route_short_name).localeCompare(String(b.route_short_name),undefined,{numeric:true});})
    .forEach(function(r){
      var o=document.createElement('option');
      o.value=r.route_id;
      o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||'');
      simR.appendChild(o);
    });
  syncSimulationFromRoute(true);
}
function bindSimulationEvents(){
  ['sim-operator','sim-route','sim-service','sim-dir'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el || el.dataset.boundSim) return;
    el.dataset.boundSim='1';
    el.addEventListener('change', function(){
      if(id==='sim-operator') updateSimulationRoutesByOperator();
      else if(id==='sim-route') updateSimulationServiceOptions();
      renderSimulation();
    });
  });
}
function updateSimulationRoutesByOperator(){
  var op=document.getElementById('sim-operator').value;
  var sel=document.getElementById('sim-route'), old=sel.value;
  sel.innerHTML='';
  var routes=Object.values(DATA.routes)
    .filter(function(r){return (DATA.tripsByRoute[String(r.route_id)]||[]).length>0 && routeMatchesOperator(r,op);})
    .sort(function(a,b){return String(a.route_short_name).localeCompare(String(b.route_short_name),undefined,{numeric:true});});
  routes.forEach(function(r){
    var o=document.createElement('option'); o.value=r.route_id; o.textContent=(r.route_short_name||r.route_id)+' — '+(r.route_long_name||''); sel.appendChild(o);
  });
  if(routes.some(function(r){return String(r.route_id)===String(old);})) sel.value=old;
  updateSimulationServiceOptions();
}
function updateSimulationServiceOptions(){
  var routeId=(document.getElementById('sim-route')||{}).value;
  var sel=document.getElementById('sim-service');
  if(sel) fillServiceSelect(sel, routeServices(routeId));
  var dirSel=document.getElementById('sim-dir'), dirs=routeDirs(routeId, sel?sel.value:'');
  if(dirSel){
    Array.prototype.forEach.call(dirSel.options,function(o){
      o.disabled=(o.value!=='-1' && dirs.indexOf(o.value)===-1);
    });
    if(dirSel.value!=='-1' && dirs.indexOf(dirSel.value)===-1) dirSel.value='-1';
  }
}
function syncSimulationFromRoute(initialOnly){
  var simR=document.getElementById('sim-route'), routeSel=document.getElementById('sel-route');
  if(!simR || !routeSel) return;
  if(!initialOnly || !simR.value) simR.value=routeSel.value;
  updateSimulationServiceOptions();
  var simSvc=document.getElementById('sim-service'), svc=document.getElementById('sel-service');
  if(simSvc && svc && routeServices(simR.value).indexOf(svc.value)!==-1) simSvc.value=svc.value;
}
function initSimulationMap(){
  if(simMap) return;
  simMap=L.map('sim-map',{zoomControl:false,preferCanvas:true}).setView([-33.45,-70.65],11);
  addInstitutionalTiles(simMap,19);
  L.control.zoom({position:'topright'}).addTo(simMap);
}
function routeLatLngAt(shapePts, progress){
  if(!shapePts || !shapePts.length) return null;
  if(shapePts.length===1) return [shapePts[0].lat, shapePts[0].lng];
  progress=Math.max(0,Math.min(1,progress));
  var total=0, segs=[];
  for(var i=1;i<shapePts.length;i++){
    var a=shapePts[i-1], b=shapePts[i];
    var d=Math.sqrt(Math.pow(a.lat-b.lat,2)+Math.pow(a.lng-b.lng,2));
    segs.push(d); total+=d;
  }
  if(total<=0){ var p0=shapePts[0]; return [p0.lat,p0.lng]; }
  var target=total*progress, acc=0;
  for(var j=1;j<shapePts.length;j++){
    var sd=segs[j-1];
    if(acc+sd>=target){
      var prev=shapePts[j-1], next=shapePts[j], local=sd?((target-acc)/sd):0;
      return [prev.lat+(next.lat-prev.lat)*local, prev.lng+(next.lng-prev.lng)*local];
    }
    acc+=sd;
  }
  var last=shapePts[shapePts.length-1]; return [last.lat,last.lng];
}
function activeSimDepartures(routeId, serviceId, dir, minute){
  var t=minute*60;
  return routeDepartures(routeId, serviceId, dir).filter(function(d){ return d.departure<=t && d.arrival>=t && d.arrival>d.departure; });
}
function vehicleIcon(label, dir){
  var cls=String(dir)==='1'?'sim-bus sim-bus-reg':'sim-bus sim-bus-ida';
  return L.divIcon({className:'', html:'<div class="'+cls+'">'+esc(label)+'</div>', iconSize:[34,34], iconAnchor:[17,17]});
}
function renderSimulation(){
  var panel=document.getElementById('tab-simulacion');
  if(!panel) return;
  if(!simMap&&panel.style.display==='none') return;
  initSimulationMap();
  if(simVehicleLayer){simMap.removeLayer(simVehicleLayer);simVehicleLayer=null;}

  var routeId=(document.getElementById('sim-route')||{}).value;
  var svcId=(document.getElementById('sim-service')||{}).value;
  if(!routeId||!svcId) return;
  var dir=Number((document.getElementById('sim-dir')||{}).value||-1);
  var route=DATA.routes[routeId]||{},routeShort=route.route_short_name||route.route_id||'';
  var nextShapeKey=[routeId,svcId,dir].join('|');
  var shapeChanged=nextShapeKey!==simShapeKey;
  var viewBounds=[],shapes=shapeChanged?L.layerGroup():null,vehicles=L.layerGroup();

  function directionPoints(d){
    var trips=(DATA.tripsByRoute[String(routeId)]||[]).filter(function(t){return String(t.service_id)===String(svcId)&&tripDir(t)===String(d);});
    var shapeTrip=trips.find(function(t){return t.shape_id&&DATA.shapes[t.shape_id]&&DATA.shapes[t.shape_id].length;});
    if(shapeTrip) return DATA.shapes[shapeTrip.shape_id];
    var ref=trips.find(function(t){return DATA.stopTimes[t.trip_id]&&DATA.stopTimes[t.trip_id].length;});
    if(!ref) return [];
    return DATA.stopTimes[ref.trip_id].map(function(st){
      var s=DATA.stops[st.stop_id];
      return s&&s.stop_lat!==null&&s.stop_lon!==null?{lat:+s.stop_lat,lng:+s.stop_lon}:null;
    }).filter(Boolean);
  }
  function drawShape(d,color){
    var pts=directionPoints(d);
    var latlngs=pts.map(function(p){return [p.lat,p.lng];});
    if(!latlngs.length) return;
    L.polyline(latlngs,{color:'#172027',weight:9,opacity:.1,lineCap:'round'}).addTo(shapes);
    L.polyline(latlngs,{color:color,weight:5,opacity:.9,lineCap:'round'}).addTo(shapes);
    viewBounds=viewBounds.concat(latlngs);
  }

  if(shapeChanged){
    if(simShapeLayer){simMap.removeLayer(simShapeLayer);simShapeLayer=null;}
    if(dir===-1||dir===0) drawShape(0,'#2563eb');
    if(dir===-1||dir===1) drawShape(1,'#dc2626');
    simShapeLayer=shapes.addTo(simMap);
    simShapeKey=nextShapeKey;
  }

  var active=activeSimDepartures(routeId,svcId,dir,simSelectedMinute);
  active.forEach(function(d){
    var shapePts=(d.trip.shape_id&&DATA.shapes[d.trip.shape_id])?DATA.shapes[d.trip.shape_id]:null;
    if(!shapePts||!shapePts.length){
      shapePts=(DATA.stopTimes[d.trip.trip_id]||[]).map(function(st){
        var s=DATA.stops[st.stop_id];
        return s&&s.stop_lat!==null&&s.stop_lon!==null?{lat:+s.stop_lat,lng:+s.stop_lon}:null;
      }).filter(Boolean);
    }
    var duration=Math.max(1,d.arrival-d.departure);
    var progress=(simSelectedMinute*60-d.departure)/duration;
    var pos=routeLatLngAt(shapePts,progress);
    if(!pos) return;
    L.marker(pos,{icon:vehicleIcon(routeShort,d.dir)}).addTo(vehicles)
      .bindPopup('<b>'+esc(routeShort)+' · '+esc(dirName(d.dir))+'</b><br>Salida '+secsToTime(d.departure)+' · llegada '+secsToTime(d.arrival)+'<br>'+esc(d.headsign||'Sin destino informado'));
    if(shapeChanged) viewBounds.push(pos);
  });
  simVehicleLayer=vehicles.addTo(simMap);
  if(shapeChanged&&viewBounds.length) simMap.fitBounds(viewBounds,{padding:[28,28],maxZoom:15});
  var count=document.getElementById('sim-count');
  if(count) count.textContent=busCountText(active.length)+' estimado'+(active.length===1?'':'s')+' · '+minsToClock(simSelectedMinute);
  renderSimulationActiveTable(active,route);
}
function renderSimulationActiveTable(active,route){
  var wrap=document.getElementById('sim-active-wrap');
  if(!wrap) return;
  if(!active.length){
    wrap.innerHTML='<div class="no-data">No hay buses estimados para este recorrido a la hora seleccionada.</div>';
    return;
  }
  var rows=active.sort(function(a,b){return a.departure-b.departure;}).map(function(d){
    var duration=Math.max(1,d.arrival-d.departure);
    var progress=Math.max(0,Math.min(100,Math.round(((simSelectedMinute*60-d.departure)/duration)*100)));
    return '<tr>'+
      '<td><span class="route-badge" style="background:'+rColor(route)+';color:'+rText(route)+'">'+esc(route.route_short_name||route.route_id||'')+'</span></td>'+
      '<td>'+esc(dirName(d.dir))+'</td><td>'+secsToTime(d.departure)+'</td><td>'+secsToTime(d.arrival)+'</td>'+
      '<td class="progress-cell"><b>'+progress+'%</b><div class="progress-track"><i style="width:'+progress+'%"></i></div></td>'+
      '<td>'+esc(d.headsign||'—')+'</td></tr>';
  }).join('');
  wrap.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Recorrido</th><th>Sentido</th><th>Salida</th><th>Llegada</th><th>Avance estimado</th><th>Destino</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function minsToClock(mins){
  mins=((Number(mins)||0)%1440+1440)%1440;
  return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
}
function onSimTimeSlide(v){
  simSelectedMinute=Number(v)||0;
  var label=document.getElementById('sim-time-label'); if(label) label.textContent=minsToClock(simSelectedMinute);
  renderSimulation();
}
function stepSimTime(delta){
  var slider=document.getElementById('sim-time-slider');
  var next=((simSelectedMinute+delta)%1440+1440)%1440;
  simSelectedMinute=next;
  if(slider) slider.value=next;
  onSimTimeSlide(next);
}


function updateSimAutoButton(running){
  var btn=document.getElementById('sim-auto-btn');
  if(!btn) return;
  btn.classList.toggle('active',running);
  btn.setAttribute('aria-pressed',running?'true':'false');
  btn.textContent=running?'❚❚ Pausar':'▶ Reproducir';
}
function stopSimAuto(){
  if(simAutoTimer){
    clearInterval(simAutoTimer);
    simAutoTimer=null;
  }
  updateSimAutoButton(false);
}
function startSimAuto(){
  if(simAutoTimer) return;
  updateSimAutoButton(true);
  simAutoTimer=setInterval(function(){ stepSimTime(10); },2000);
}
function toggleSimAuto(){
  if(simAutoTimer) stopSimAuto();
  else startSimAuto();
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden) stopSimAuto();
});


/* Buses en operación */
function normalizeBusKey(value){
  return String(value||'').trim().toUpperCase().replace(/\s+/g,'');
}
function busOperatorNameFromDeco(row){
  return String(row&&(row.CLI_DSC||row.OPERADOR)||'').trim();
}
function busOperatorKeyFromDeco(row){
  var name=busOperatorNameFromDeco(row);
  if(!name) return 'sin-operador';
  var normalized=normalizeBusKey(name);
  var numeric=Object.keys(BUS_OPERATOR_NAMES).find(function(key){
    return normalizeBusKey(BUS_OPERATOR_NAMES[key])===normalized;
  });
  return numeric || 'deco:'+normalized;
}
function decoPublicRoute(row){
  return String(row&&row.CODIGO_USUARIO||'').trim();
}
function setBusStatus(title, detail, state, emphasis){
  var box=document.getElementById('bus-status');
  if(!box) return;
  box.className='panel-status bus-status'+(state?' is-'+state:'');
  box.innerHTML='<strong>'+esc(title)+'</strong><span>'+esc(detail)+'</span>'+
    (emphasis?'<strong class="bus-refresh-emphasis">'+esc(emphasis)+'</strong>':'');
}
function parseBusDate(value){
  var raw=String(value||'').trim();
  if(!raw) return null;
  if(/[+-]\d{4}$/.test(raw)) raw=raw.replace(/([+-]\d{2})(\d{2})$/,'$1:$2');
  var date=new Date(raw);
  return isNaN(date.getTime())?null:date;
}
function formatBusDate(value){
  var date=value instanceof Date?value:parseBusDate(value);
  if(!date) return 'Hora no informada';
  return new Intl.DateTimeFormat('es-CL',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'
  }).format(date);
}
function buildBusDecoIndex(rows){
  var index={
    CODIGO_RUTA:Object.create(null),
    CODIGO_MTT:Object.create(null),
    SERVICIO_DECO:Object.create(null),
    CODIGO_USUARIO:Object.create(null)
  };
  (rows||[]).forEach(function(row){
    if(!row) return;
    Object.keys(index).forEach(function(field){
      var key=normalizeBusKey(row[field]);
      if(key && !index[field][key]) index[field][key]=row;
    });
  });
  return index;
}
async function ensureBusDeco(){
  if(BUS_STATE.decoReady) return;
  var rows=(DATA.decoRows||[]).slice();
  if(!rows.length) throw new Error('No hay información vigente de operadores para el monitoreo.');
  BUS_STATE.decoIndex=buildBusDecoIndex(rows);
  BUS_STATE.decoReady=true;
}
function findBusDeco(rawRoute){
  var index=BUS_STATE.decoIndex;
  if(!index) return null;
  var key=normalizeBusKey(rawRoute);
  var exactOrder=['CODIGO_RUTA','CODIGO_MTT','SERVICIO_DECO','CODIGO_USUARIO'];
  for(var i=0;i<exactOrder.length;i++){
    var exact=index[exactOrder[i]][key];
    if(exact) return exact;
  }
  var base=String(rawRoute||'').trim().toUpperCase().match(/^T(\d+)(?=\s|$)/);
  if(base){
    var numericKey=base[1];
    var baseOrder=['CODIGO_MTT','SERVICIO_DECO','CODIGO_USUARIO'];
    for(var j=0;j<baseOrder.length;j++){
      var row=index[baseOrder[j]][numericKey];
      if(row) return row;
    }
  }
  return null;
}
function busDirection(properties){
  var label=String(properties.route_direction||'').trim().toLowerCase();
  if(label.indexOf('ida')===0) return 'I';
  if(label.indexOf('reg')===0) return 'R';
  var route=String(properties.route_code||'').trim().toUpperCase();
  if(/I$/.test(route)) return 'I';
  if(/R$/.test(route)) return 'R';
  return '';
}
function enrichBusFeature(feature){
  if(!feature || !feature.geometry || feature.geometry.type!=='Point') return null;
  var coordinates=feature.geometry.coordinates||[];
  var longitude=Number(coordinates[0]), latitude=Number(coordinates[1]);
  if(!isFinite(longitude)||!isFinite(latitude)) return null;
  if(latitude<-35 || latitude>-32 || longitude<-72 || longitude>-69) return null;
  var properties=feature.properties||{};
  var rawRoute=String(properties.route_code||'').trim();
  var deco=findBusDeco(rawRoute);
  var publicRoute=String(deco&&deco.CODIGO_USUARIO||'Sin recorrido').trim()||rawRoute||'Sin recorrido';
  var sourceOperatorKey=String(properties.operator===undefined||properties.operator===null?'':properties.operator).trim();
  var decoOperatorKey=deco?busOperatorKeyFromDeco(deco):'';
  var operatorKey=decoOperatorKey && decoOperatorKey!=='sin-operador'
    ? decoOperatorKey
    : (sourceOperatorKey||'sin-operador');
  var operatorName=busOperatorNameFromDeco(deco) || BUS_OPERATOR_NAMES[sourceOperatorKey] || 'Operador no informado';
  var plate=String(properties.license_plate||'Patente no informada').trim().toUpperCase();
  var internalMatch=rawRoute.match(/(T[^,;|]+)/i);
  var internalCode=String(deco&&deco.CODIGO_RUTA||'').trim().toUpperCase();
  if(!internalCode) internalCode=internalMatch?internalMatch[1].trim().toUpperCase():(rawRoute||'Código no informado');
  var timestamp=parseBusDate(properties.timestamp);
  var direction=busDirection(properties);
  return {
    latitude:latitude,
    longitude:longitude,
    plate:plate,
    rawRoute:internalCode,
    internalCode:internalCode,
    publicRoute:publicRoute,
    routeKey:normalizeBusKey(publicRoute),
    direction:direction,
    directionLabel:direction==='I'?'Ida':(direction==='R'?'Regreso':'Sin sentido'),
    operatorKey:operatorKey||'sin-operador',
    operatorName:operatorName,
    speed:isFinite(Number(properties.speed))?Number(properties.speed):null,
    timestamp:timestamp,
    timestampRaw:properties.timestamp||''
  };
}
function extractBusFeatures(payload){
  if(typeof payload==='string'){
    payload=JSON.parse(payload.replace(/^\uFEFF/,'').trim());
  }
  if(payload && payload.geojson && Array.isArray(payload.geojson.features)) return payload.geojson.features;
  if(payload && payload.data && payload.data.geojson && Array.isArray(payload.data.geojson.features)) return payload.data.geojson.features;
  if(payload && Array.isArray(payload.features)) return payload.features;
  if(Array.isArray(payload)) return payload;
  throw new Error('La respuesta no contiene una colección de buses válida.');
}
async function fetchBusEndpoint(url){
  var controller=typeof AbortController!=='undefined'?new AbortController():null;
  var timeout=controller?setTimeout(function(){controller.abort();},20000):null;
  try{
    var response=await fetch(url,{
      cache:'no-store',
      credentials:'omit',
      signal:controller?controller.signal:undefined
    });
    if(!response.ok) throw new Error('HTTP '+response.status);
    var text=await response.text();
    return extractBusFeatures(text);
  }finally{
    if(timeout) clearTimeout(timeout);
  }
}
function mergeBusFeatures(featureLists){
  var byPlate=new Map();
  (featureLists||[]).forEach(function(list){
    (list||[]).forEach(function(feature){
      var bus=enrichBusFeature(feature);
      if(!bus) return;
      var key=normalizeBusKey(bus.plate);
      if(!key || key==='PPUNOINFORMADA'){
        key=normalizeBusKey(bus.rawRoute)+'|'+bus.latitude.toFixed(6)+'|'+bus.longitude.toFixed(6);
      }
      var previous=byPlate.get(key);
      if(!previous || (!previous.timestamp && bus.timestamp) ||
         (previous.timestamp && bus.timestamp && bus.timestamp>previous.timestamp)){
        byPlate.set(key,bus);
      }
    });
  });
  return Array.from(byPlate.values());
}
function operatorDisplayLabel(key, name){
  var publicName=String(name||'').trim();
  return publicName || 'Operador no informado';
}
function fillBusOperatorOptions(){
  var select=document.getElementById('bus-operator-filter');
  if(!select) return;
  var keep=select.value||'__all';
  var operators=Object.create(null);

  (DATA.decoRows||[]).forEach(function(row){
    var key=busOperatorKeyFromDeco(row);
    var name=busOperatorNameFromDeco(row)||'Operador no informado';
    if(!operators[key]) operators[key]={name:name,count:0};
  });
  BUS_STATE.features.forEach(function(bus){
    if(!operators[bus.operatorKey]) operators[bus.operatorKey]={name:bus.operatorName,count:0};
    operators[bus.operatorKey].count++;
  });

  select.innerHTML='<option value="__all">Todos los operadores ('+busCountText(BUS_STATE.features.length)+')</option>';
  Object.keys(operators).sort(function(a,b){
    return operators[a].name.localeCompare(operators[b].name,undefined,{numeric:true,sensitivity:'base'});
  }).forEach(function(key){
    var item=operators[key];
    var option=document.createElement('option');
    option.value=key;
    option.textContent=operatorDisplayLabel(key,item.name)+' ('+(item.count?busCountText(item.count):'sin buses actuales')+')';
    select.appendChild(option);
  });
  if(Array.from(select.options).some(function(option){return option.value===keep;})) select.value=keep;
  else select.value='__all';
}
function updateBusRouteOptions(){
  var operatorSelect=document.getElementById('bus-operator-filter');
  var routeSelect=document.getElementById('bus-route-filter');
  if(!routeSelect) return;
  var operator=operatorSelect?operatorSelect.value:'__all';
  var keep=routeSelect.value||'__all';
  var routes=Object.create(null);

  (DATA.decoRows||[]).forEach(function(row){
    var rowOperator=busOperatorKeyFromDeco(row);
    if(operator!=='__all' && rowOperator!==operator) return;
    var label=decoPublicRoute(row);
    var key=normalizeBusKey(label);
    if(!key) return;
    if(!routes[key]) routes[key]={label:label,count:0};
  });

  BUS_STATE.features.forEach(function(bus){
    if(operator!=='__all' && bus.operatorKey!==operator) return;
    if(!routes[bus.routeKey]) routes[bus.routeKey]={label:bus.publicRoute,count:0};
    routes[bus.routeKey].count++;
  });

  BUS_STATE.catalogRoutes=Object.keys(routes).length;
  var liveTotal=Object.keys(routes).reduce(function(sum,key){return sum+routes[key].count;},0);
  routeSelect.innerHTML='<option value="__all">Todos los recorridos ('+busCountText(liveTotal)+' · '+BUS_STATE.catalogRoutes+' códigos)</option>';
  Object.keys(routes).sort(function(a,b){
    return routes[a].label.localeCompare(routes[b].label,undefined,{numeric:true,sensitivity:'base'});
  }).forEach(function(key){
    var option=document.createElement('option');
    option.value=key;
    option.textContent=routes[key].label+' ('+(routes[key].count?busCountText(routes[key].count):'sin buses actuales')+')';
    routeSelect.appendChild(option);
  });
  if(Array.from(routeSelect.options).some(function(option){return option.value===keep;})) routeSelect.value=keep;
  else routeSelect.value='__all';
}
function onBusOperatorChange(){
  updateBusRouteOptions();
  renderBusLayer();
}
function setBusDirection(direction){
  BUS_STATE.direction=direction;
  ['all','i','r'].forEach(function(key){
    var button=document.getElementById('bus-dir-'+key);
    if(button) button.classList.toggle('active',key===(direction==='all'?'all':direction.toLowerCase()));
  });
  renderBusLayer();
}
function filteredBuses(){
  var operatorSelect=document.getElementById('bus-operator-filter');
  var routeSelect=document.getElementById('bus-route-filter');
  var plateInput=document.getElementById('bus-plate-filter');
  var operator=operatorSelect?operatorSelect.value:'__all';
  var route=routeSelect?routeSelect.value:'__all';
  var plateQuery=normalizeBusKey(plateInput?plateInput.value:'');
  return BUS_STATE.features.filter(function(bus){
    if(plateQuery && normalizeBusKey(bus.plate).indexOf(plateQuery)===-1) return false;
    if(operator!=='__all' && bus.operatorKey!==operator) return false;
    if(route!=='__all' && bus.routeKey!==route) return false;
    if(BUS_STATE.direction!=='all' && bus.direction!==BUS_STATE.direction) return false;
    return true;
  });
}
function busPopupHtml(bus){ var vehicle=vehicleInfoByPlate(bus.plate)||{};
  var speed=bus.speed===null?'No informada':bus.speed.toLocaleString('es-CL',{maximumFractionDigits:1})+' km/h';
  return '<div class="bus-popup">'+
    '<span class="bus-popup-kicker">Recorrido</span>'+
    '<strong class="bus-popup-route">'+esc(bus.publicRoute)+'</strong>'+
    '<span class="bus-popup-code">Código interno · '+esc(bus.internalCode||bus.rawRoute)+'</span>'+
    '<dl>'+
      '<div><dt>Patente</dt><dd>'+esc(bus.plate)+'</dd></div>'+
      '<div><dt>Operador</dt><dd>'+esc(operatorDisplayLabel(bus.operatorKey,bus.operatorName))+'</dd></div>'+
      '<div><dt>Sentido</dt><dd>'+esc(bus.directionLabel)+'</dd></div>'+
      '<div><dt>Velocidad</dt><dd>'+esc(speed)+'</dd></div>'+'<div><dt>Tipo de bus</dt><dd>'+esc(vehicle.type||'No informado')+'</dd></div>'+'<div><dt>Tecnología / Combustible</dt><dd>'+esc(vehicle.tech||'No informado')+'</dd></div>'+
      '<div><dt>Último dato</dt><dd>'+esc(formatBusDate(bus.timestamp))+'</dd></div>'+
    '</dl>'+
  '</div>';
}
function detachBusLayer(){
  if(leafMap && busLayer && leafMap.hasLayer(busLayer)) leafMap.removeLayer(busLayer);
}
function renderBusLayer(){
  if(!leafMap || CURRENT_MAP_MODE!=='buses') return;
  detachBusLayer();
  var buses=filteredBuses();
  BUS_STATE.visibleCount=buses.length;
  busLayer=L.layerGroup();
  buses.forEach(function(bus){
    var color=bus.direction==='I'?'#00bcd4':(bus.direction==='R'?'#ff6b00':'#7c3aed');
    var icon=L.divIcon({className:'',html:'<div style="position:relative;text-align:center"><div style="width:22px;height:22px;border-radius:50%;background:'+color+';border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.45)"></div><div style="margin-top:2px;background:#111;color:#fff;font-size:10px;font-weight:700;padding:1px 3px;border-radius:3px;white-space:nowrap">'+esc(bus.plate)+'</div></div>',iconSize:[60,38],iconAnchor:[11,11]});
    var marker=L.marker([bus.latitude,bus.longitude],{icon:icon,bubblingMouseEvents:false,zIndexOffset:1000});
    marker.bindPopup(function(){return busPopupHtml(bus);},{maxWidth:310});
    busLayer.addLayer(marker);
  });
  busLayer.addTo(leafMap);
  var suffix=BUS_STATE.sourceCount<2?' Parte de la información no está disponible.':'';
  setBusStatus(
    'Buses visibles: '+buses.length,
    'Buses informados: '+BUS_STATE.features.length+'. Recorridos disponibles: '+BUS_STATE.catalogRoutes+'. Actualizado: '+formatBusDate(BUS_STATE.lastLoadedAt)+'.'+suffix,
    BUS_STATE.sourceCount<2?'warning':'ready',
    'Actualización cada 60 segundos solo mientras esta vista está activa.'
  );
  var label=document.getElementById('map-context-label');
  if(label) label.textContent=busCountText(buses.length)+' visible'+(buses.length===1?'':'s');
}
function renderRouteBusOverlay(){
  var status=document.getElementById('route-live-bus-status');
  if(APP_MODE!=='realtime' || !leafMap || CURRENT_MAP_MODE!=='ruta'){
    if(status) status.hidden=true;
    return;
  }
  detachBusLayer();
  var routeSelect=document.getElementById('sel-route');
  var route=routeSelect&&routeSelect.value?DATA.routes[routeSelect.value]:null;
  var routeLabel=route?String(route.route_short_name||route.route_id||'').trim():'';
  var routeKey=normalizeBusKey(routeLabel);
  if(!routeKey){
    if(status){
      status.hidden=false;
      status.textContent='Selecciona un recorrido para superponer sus buses actuales.';
    }
    return;
  }
  var direction=curMapDir===0?'I':(curMapDir===1?'R':'all');
  var buses=BUS_STATE.features.filter(function(bus){
    if(bus.routeKey!==routeKey) return false;
    if(direction!=='all' && bus.direction!==direction) return false;
    return true;
  });
  busLayer=L.layerGroup();
  buses.forEach(function(bus){
    var marker=L.circleMarker([bus.latitude,bus.longitude],{radius:9,color:'#fff',weight:3,fillColor:'#00bcd4',fillOpacity:1,bubblingMouseEvents:false});
    marker.bindTooltip(bus.plate,{permanent:true,direction:'top',offset:[0,-10]});
    marker.bindPopup(function(){return busPopupHtml(bus);},{maxWidth:310});
    busLayer.addLayer(marker);
  });
  busLayer.addTo(leafMap);
  if(status){
    status.hidden=false;
    status.innerHTML='<strong>'+busCountText(buses.length)+' actual'+(buses.length===1?'':'es')+' en el trazado</strong><span>Recorrido '+esc(routeLabel)+' · '+esc(direction==='I'?'Ida':(direction==='R'?'Regreso':'ambos sentidos'))+'.</span>';
  }
}
async function applyBusFeatureLists(featureLists, sourceCount, sourceErrors){
  await ensureBusDeco();
  BUS_STATE.features=mergeBusFeatures(featureLists);
  BUS_STATE.sourceCount=sourceCount;
  BUS_STATE.sourceErrors=sourceErrors||[];
  BUS_STATE.lastLoadedAt=new Date();
  fillBusOperatorOptions();
  updateBusRouteOptions();
  if(CURRENT_MAP_MODE==='buses') renderBusLayer();
  if(CURRENT_MAP_MODE==='ruta') renderRouteBusOverlay();
}
async function loadBusData(force){
  if(BUS_STATE.loading) return;
  if(!force && BUS_STATE.lastLoadedAt && Date.now()-BUS_STATE.lastLoadedAt.getTime()<45000){
    renderBusLayer();
    startBusRefresh();
    return;
  }
  BUS_STATE.loading=true;
  var token=++busRequestToken;
  setBusStatus('Actualizando posiciones','Consultando buses en circulación…','loading');
  try{
    await ensureBusDeco();
    var results=await Promise.allSettled(BUS_ENDPOINTS.map(fetchBusEndpoint));
    if(token!==busRequestToken) return;
    var lists=[], errors=[];
    results.forEach(function(result,index){
      if(result.status==='fulfilled') lists.push(result.value);
      else errors.push('Fuente '+(index+1)+': '+(result.reason&&result.reason.message||'sin respuesta'));
    });
    if(!lists.length) throw new Error('Las dos fuentes rechazaron la solicitud.');
    await applyBusFeatureLists(lists,lists.length,errors);
  }catch(error){
    console.error(error);
    setBusStatus(
      'No se pudieron cargar los buses',
      'No fue posible consultar las posiciones. Intenta actualizar nuevamente más tarde.',
      'error'
    );
  }finally{
    if(token===busRequestToken) BUS_STATE.loading=false;
    if(CURRENT_MAP_MODE==='buses') startBusRefresh();
  }
}
function startBusRefresh(){
  stopBusRefresh();
  if(CURRENT_MAP_MODE!=='buses') return;
  busRefreshTimer=setInterval(function(){
    if(document.hidden || CURRENT_MAP_MODE!=='buses') return;
    loadBusData(true);
  },60000);
}
function stopBusRefresh(){
  if(busRefreshTimer){
    clearInterval(busRefreshTimer);
    busRefreshTimer=null;
  }
}
function openBusView(){
  if(!leafMap) initMap();
  if(BUS_STATE.features.length){
    renderBusLayer();
    startBusRefresh();
  }else{
    loadBusData(false);
  }
}
document.addEventListener('visibilitychange',function(){
  if(document.hidden) stopBusRefresh();
  else if(CURRENT_MAP_MODE==='buses') startBusRefresh();
});



/* Nombres públicos para acciones de la interfaz. */
function syncParamRouteFromCurrent(){ return syncParamRouteFromGTFS(); }
function compareSelectedDates(){ return compareSelectedGTFS(); }

/* Navegación cartográfica */
var CURRENT_MAP_MODE='resumen';

function fitSantiago(mapInstance){
  if(!mapInstance) return;
  mapInstance.fitBounds(
    [[-33.72,-70.98],[-33.27,-70.42]],
    {padding:[18,18],maxZoom:11}
  );
}

function toggleContextPanel(force){
  var panel=document.getElementById('context-panel');
  if(!panel) return;
  var collapsed=typeof force==='boolean'?!force:!panel.classList.contains('is-collapsed');
  panel.classList.toggle('is-collapsed',collapsed);
  document.body.classList.toggle('context-collapsed',collapsed);
  setTimeout(function(){
    if(leafMap) leafMap.invalidateSize();
    if(stopLeafMap) stopLeafMap.invalidateSize();
    if(simMap) simMap.invalidateSize();
  },240);
}
function toggleDetailsSheet(force){
  var panel=document.getElementById('tab-'+CURRENT_MAP_MODE);
  var sheet=panel?panel.querySelector('.details-sheet'):null;
  if(!sheet) return;
  var open=typeof force==='boolean'?force:!sheet.classList.contains('is-open');
  sheet.classList.toggle('is-open',open);
  var button=sheet.querySelector('.sheet-toggle');
  if(button) button.textContent=open?'Ocultar':'Ver detalles';
  setTimeout(function(){
    if(leafMap) leafMap.invalidateSize();
    if(stopLeafMap) stopLeafMap.invalidateSize();
    if(simMap) simMap.invalidateSize();
    if(freqChart) freqChart.resize();
    if(stopChart) stopChart.resize();
    if(overviewChart) overviewChart.resize();
  },260);
}
function clearRouteLayers(){
  if(!leafMap) return;
  if(layerIda&&leafMap.hasLayer(layerIda)) leafMap.removeLayer(layerIda);
  if(layerReg&&leafMap.hasLayer(layerReg)) leafMap.removeLayer(layerReg);
  if(layerStops&&leafMap.hasLayer(layerStops)) leafMap.removeLayer(layerStops);
  layerIda=null;layerReg=null;layerStops=null;
}
function mapContextLabel(tab){
  if(tab==='ruta'){
    var sel=document.getElementById('sel-route');
    var route=sel&&sel.value?DATA.routes[sel.value]:null;
    return route?'Recorrido '+(route.route_short_name||route.route_id):'Trazado del recorrido';
  }
  if(tab==='paradero'){
    if(activeStop&&DATA.stops[activeStop]) return cleanName(DATA.stops[activeStop].stop_name||activeStop);
    return 'Buscar paradero';
  }
  if(tab==='buses') return BUS_STATE.visibleCount?busCountText(BUS_STATE.visibleCount)+' visible'+(BUS_STATE.visibleCount===1?'':'s'):'Buses en circulación';
  if(tab==='simulacion') return 'Buses estimados';
  if(tab==='comparar') return 'Comparar fechas';
  if(tab==='parametros') return 'Indicadores operacionales';
  return 'Santiago completo';
}
function setMapContext(tab){
  CURRENT_MAP_MODE=tab;
  document.body.setAttribute('data-map-mode',tab);
  if(tab!=='buses') stopBusRefresh();
  if(tab!=='buses' && tab!=='ruta') detachBusLayer();
  document.querySelectorAll('.geo-map').forEach(function(el){el.classList.remove('is-active');});
  var routeMap=document.getElementById('map');
  var stopMapEl=document.getElementById('stop-map');
  var simMapEl=document.getElementById('sim-map');
  var target=routeMap;

  if(tab==='paradero'){
    target=stopMapEl;
    if(target) target.classList.add('is-active');
    initStopMap();
    if(!activeStop) fitSantiago(stopLeafMap);
    setTimeout(function(){stopLeafMap.invalidateSize();if(activeStop)renderStopMap(activeStop);},50);
  }else if(tab==='simulacion'){
    target=simMapEl;
    if(target) target.classList.add('is-active');
    initSimulationMap();
    setTimeout(function(){simMap.invalidateSize();renderSimulation();},50);
  }else{
    target=routeMap;
    if(target) target.classList.add('is-active');
    if(!leafMap) initMap();
    if(tab==='ruta'){
      detachBusLayer();
      renderMap();
      if(APP_MODE==='realtime'){
        if(BUS_STATE.features.length) renderRouteBusOverlay();
        else loadBusData(false);
      }
      setTimeout(function(){leafMap.invalidateSize();fitRouteMap();},50);
    }else{
      clearRouteLayers();
      if(tab==='buses') openBusView();
      fitSantiago(leafMap);
      setTimeout(function(){leafMap.invalidateSize();},50);
    }
  }
  var label=document.getElementById('map-context-label');
  if(label) label.textContent=mapContextLabel(tab);
}
function resetCurrentMapView(){
  if(CURRENT_MAP_MODE==='ruta'){
    fitRouteMap();
    return;
  }
  if(CURRENT_MAP_MODE==='paradero'){
    if(activeStop) renderStopMap(activeStop);
    else if(stopLeafMap) fitSantiago(stopLeafMap);
    return;
  }
  if(CURRENT_MAP_MODE==='simulacion'){
    if(simMap){
      simShapeKey='';
      renderSimulation();
      if(!simShapeLayer) fitSantiago(simMap);
    }
    return;
  }
  if(leafMap) fitSantiago(leafMap);
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){
    toggleDetailsSheet(false);
    toggleContextPanel(true);
  }
});

function switchTab(tab){
  var available=tabAvailability();
  if(!available[tab]) return;
  var meta={
    resumen:['Cobertura metropolitana','Mapa de Santiago','Vista general'],
    buses:['Ubicación actual','Buses en circulación','Buses'],
    ruta:['Recorrido y paradas','Trazado del recorrido','Trazado'],
    paradero:['Paraderos','Buscar paradero','Paraderos'],
    parametros:['Información adicional','Indicadores operacionales','Indicadores'],
    simulacion:['Estimación por horario','Buses estimados','Estimación'],
    comparar:['Cambios en el tiempo','Comparar fechas','Comparación']
  };
  document.querySelectorAll('.tab-btn[data-tab]').forEach(function(button){
    button.classList.toggle('active',button.getAttribute('data-tab')===tab);
  });
  ['resumen','buses','ruta','paradero','parametros','simulacion','comparar'].forEach(function(name){
    var panel=document.getElementById('tab-'+name);
    if(panel) panel.style.display=name===tab?'block':'none';
  });
  var title=document.getElementById('page-title');
  var eyebrow=document.getElementById('page-eyebrow');
  var panelTitle=document.getElementById('context-panel-title');
  if(title) title.textContent=(meta[tab]||['',tab,''])[1];
  if(eyebrow) eyebrow.textContent=(meta[tab]||['','',''])[0];
  if(panelTitle) panelTitle.textContent=(meta[tab]||['','',tab])[2];
  document.title=(meta[tab]?meta[tab][1]:'Mapa Operativo RED')+' — Mapa Operativo RED';

  if(tab!=='simulacion') stopSimAuto();
  setMapContext(tab);

  if(tab==='resumen'){
    renderOverview();
    if(overviewChart) setTimeout(function(){overviewChart.resize();},80);
  }
  if(tab==='parametros') ensureParamsLoaded();
  if(tab==='simulacion') setTimeout(function(){syncSimulationFromRoute();renderSimulation();},70);
}

