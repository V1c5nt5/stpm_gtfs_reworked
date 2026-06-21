/* v1.3.0 — procesador GTFS fuera del hilo principal */
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js');

var DATA = null;

function postProgress(pct, text){
  self.postMessage({type:'progress', pct:pct, text:text});
}
function freshData(){
  return {
    agency:{}, routes:{}, trips:{}, frequencies:[], frequenciesByTrip:{}, stopTimes:{}, stops:{}, stopIndex:{}, stopTrips:{}, shapes:{},
    calendar:{}, calendarDates:[], feedInfo:null, levels:{}, pathways:[], pathwaysByStop:{}, serviceIds:[], tripsByRoute:{}, tripsByService:{}, tripsByStop:{}
  };
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
function cleanName(n){ return (n||'').replace(/^[A-Z0-9]+-/, '').trim(); }
function unique(arr){ return Array.from(new Set(arr.filter(function(x){return x!==undefined&&x!==null&&x!=='';}))); }
function sortServices(a,b){
  var order = {L:1,LJ:2,V:3,S:4,D:5,F:6};
  return (order[a]||99)-(order[b]||99) || String(a).localeCompare(String(b),undefined,{numeric:true});
}
function getTripStartOffset(tripId){
  var st = DATA.stopTimes[tripId]||[];
  if(!st.length) return 0;
  return timeToSecs(st[0].departure_time||st[0].arrival_time||'0:00:00');
}
async function parseGTFS(file){
  DATA = freshData();
  postProgress(10, 'Descomprimiendo GTFS...');
  var zip = await JSZip.loadAsync(file);
  var required = ['routes.txt','trips.txt','stops.txt','stop_times.txt'];
  var missing = required.filter(function(name){ return !zip.file(name); });
  if(missing.length) throw new Error('Faltan archivos GTFS obligatorios: ' + missing.join(', '));

  async function readTxt(name){ var f=zip.file(name); return f?await f.async('string'):''; }
  function parse(txt){ return txt ? Papa.parse(txt.trim(),{header:true,skipEmptyLines:true,dynamicTyping:false}).data : []; }

  postProgress(14, 'Leyendo agencia...');
  parse(await readTxt('agency.txt')).forEach(function(a){ DATA.agency[a.agency_id||a.agency_name||'default']=a; });
  var feedRows = parse(await readTxt('feed_info.txt'));
  DATA.feedInfo = feedRows.length ? feedRows[0] : null;

  postProgress(20, 'Leyendo calendario...');
  parse(await readTxt('calendar.txt')).forEach(function(c){ DATA.calendar[c.service_id]=c; });
  DATA.calendarDates = parse(await readTxt('calendar_dates.txt'));

  postProgress(26, 'Leyendo rutas...');
  parse(await readTxt('routes.txt')).forEach(function(r){ DATA.routes[String(r.route_id)]=r; });

  postProgress(36, 'Leyendo viajes...');
  parse(await readTxt('trips.txt')).forEach(function(t){
    t.route_id = String(t.route_id);
    t.trip_id = String(t.trip_id);
    t.service_id = String(t.service_id);
    t.direction_id = String(t.direction_id==null||t.direction_id===''?0:t.direction_id);
    DATA.trips[t.trip_id]=t;
    if(!DATA.tripsByRoute[t.route_id]) DATA.tripsByRoute[t.route_id]=[];
    DATA.tripsByRoute[t.route_id].push(t);
    if(!DATA.tripsByService[t.service_id]) DATA.tripsByService[t.service_id]=[];
    DATA.tripsByService[t.service_id].push(t);
  });

  postProgress(44, 'Leyendo frecuencias...');
  DATA.frequencies = parse(await readTxt('frequencies.txt')).map(function(f){
    f.trip_id=String(f.trip_id); f.headway_secs=csvNum(f.headway_secs); f.exact_times=csvNum(f.exact_times,0);
    if(!DATA.frequenciesByTrip[f.trip_id]) DATA.frequenciesByTrip[f.trip_id]=[];
    DATA.frequenciesByTrip[f.trip_id].push(f);
    return f;
  });

  postProgress(52, 'Leyendo paraderos...');
  parse(await readTxt('stops.txt')).forEach(function(s){
    s.stop_id=String(s.stop_id); s.stop_lat=csvNum(s.stop_lat,null); s.stop_lon=csvNum(s.stop_lon,null);
    DATA.stops[s.stop_id] = s;
    var name = cleanName(s.stop_name||s.stop_id);
    DATA.stopIndex[s.stop_id] = {name:name, key:(name+' '+s.stop_id+' '+(s.stop_desc||'')).toLowerCase(), s:s};
  });

  postProgress(60, 'Leyendo trazados...');
  parse(await readTxt('shapes.txt')).forEach(function(row){
    if(!row.shape_id) return;
    if(!DATA.shapes[row.shape_id]) DATA.shapes[row.shape_id]=[];
    DATA.shapes[row.shape_id].push({lat:csvNum(row.shape_pt_lat), lng:csvNum(row.shape_pt_lon), seq:csvNum(row.shape_pt_sequence)});
  });
  Object.keys(DATA.shapes).forEach(function(sid){ DATA.shapes[sid].sort(function(a,b){return a.seq-b.seq;}); });

  postProgress(68, 'Leyendo conexiones...');
  parse(await readTxt('levels.txt')).forEach(function(l){ if(l.level_id) DATA.levels[l.level_id]=l; });
  DATA.pathways = parse(await readTxt('pathways.txt'));
  DATA.pathways.forEach(function(pw){
    ['from_stop_id','to_stop_id'].forEach(function(k){
      if(!pw[k]) return;
      if(!DATA.pathwaysByStop[pw[k]]) DATA.pathwaysByStop[pw[k]]=[];
      DATA.pathwaysByStop[pw[k]].push(pw);
    });
  });

  postProgress(78, 'Leyendo horarios...');
  var stRows = parse(await readTxt('stop_times.txt'));

  postProgress(90, 'Construyendo índices...');
  stRows.forEach(function(row){
    row.trip_id=String(row.trip_id); row.stop_id=String(row.stop_id); row.stop_sequence=csvNum(row.stop_sequence);
    if(!DATA.stopTimes[row.trip_id]) DATA.stopTimes[row.trip_id]=[];
    DATA.stopTimes[row.trip_id].push(row);
  });
  Object.keys(DATA.stopTimes).forEach(function(tripId){
    DATA.stopTimes[tripId].sort(function(a,b){return a.stop_sequence-b.stop_sequence;});
    var start = getTripStartOffset(tripId);
    DATA.stopTimes[tripId].forEach(function(row){
      if(!DATA.stopTrips[row.stop_id]) DATA.stopTrips[row.stop_id]=[];
      DATA.stopTrips[row.stop_id].push({trip_id:tripId, seq:row.stop_sequence, offset:timeToSecs(row.departure_time||row.arrival_time||'0:00:00')-start, stopTime:row});
    });
  });
  DATA.serviceIds = unique(Object.values(DATA.trips).map(function(t){return t.service_id;})).sort(sortServices);
  postProgress(98, 'Preparando interfaz...');
  return DATA;
}

self.onmessage = async function(e){
  try{
    var parsed = await parseGTFS(e.data.file);
    self.postMessage({type:'done', data:parsed});
  }catch(err){
    self.postMessage({type:'error', message:err && err.message ? err.message : String(err)});
  }
};
