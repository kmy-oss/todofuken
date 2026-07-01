// 問題生成エンジン
// PREFS(47都道府県データ) と GEO_POOL(地政学プール) から QUIZ_DATA を組み立てる。
// 逆引き(値→都道府県)は「1都道府県だけに現れる値」に限定し、曖昧な正解を排除する。

(function (global) {
  "use strict";
  const PREFS = global.PREFS || (typeof require !== "undefined" ? require("./prefectures.js").PREFS : []);
  const GEO_POOL = global.GEO_POOL || (typeof require !== "undefined" ? require("./geopolitics.js").GEO_POOL : {});

  function rnd(n){ return Math.floor(Math.random()*n); }
  function shuffle(a){ const r=a.slice(); for(let i=r.length-1;i>0;i--){const j=rnd(i+1);[r[i],r[j]]=[r[j],r[i]];} return r; }
  function uniq(a){ return [...new Set(a)]; }

  // 値の出現回数（逆引きの一意性判定用）
  function countMap(getArr){
    const m={};
    PREFS.forEach(p=>{ (getArr(p)||[]).forEach(v=>{ m[v]=(m[v]||0)+1; }); });
    return m;
  }
  const specCount = countMap(p=>p.spec);
  const spotCount = countMap(p=>p.spot);
  const oldCount  = countMap(p=>p.old);
  const natCount  = countMap(p=>p.nature?[p.nature]:[]);
  const festCount = countMap(p=>p.fest?[p.fest]:[]);

  const ALL_NAMES = PREFS.map(p=>p.name);
  const ALL_CAPS  = PREFS.filter(p=>p.name!=="東京都").map(p=>p.cap);
  const ALL_REGIONS = uniq(PREFS.map(p=>p.region));
  const MAIN_ISLANDS = ["北海道","本州","四国","九州"];
  // 一意な旧国名（順引きのダミー候補に使う）
  const ALL_UNIQUE_OLDS = [];
  PREFS.forEach(p=>(p.old||[]).forEach(o=>{ if(oldCount[o]===1) ALL_UNIQUE_OLDS.push(o); }));

  // correct を除いた候補から distractor を n 個。prefer(同カテゴリ)を優先。
  function pickDistractors(correct, candidates, n, prefer){
    const pool = uniq(candidates.filter(c=>c && c!==correct));
    const preferred = shuffle(uniq((prefer||[]).filter(c=>c && c!==correct)));
    const rest = shuffle(pool.filter(c=>!preferred.includes(c)));
    const out=[];
    for(const c of preferred){ if(out.length>=n) break; out.push(c); }
    for(const c of rest){ if(out.length>=n) break; out.push(c); }
    return out.length>=n ? out.slice(0,n) : null;
  }

  function makeQ(q, correct, distractors){
    if(!distractors || distractors.length<2) return null;
    const choices = shuffle([correct, distractors[0], distractors[1]]);
    return { q, choices, answer: choices.indexOf(correct) };
  }

  const buckets = { elementary:[], junior:[], senior:[] };
  const push = (lvl,item)=>{ if(item) buckets[lvl].push(item); };

  PREFS.forEach(p=>{
    const sameRegionNames = PREFS.filter(x=>x.region===p.region && x.name!==p.name).map(x=>x.name);
    const sameRegionCaps  = PREFS.filter(x=>x.region===p.region && x.name!==p.name && x.name!=="東京都").map(x=>x.cap);

    // 1) 県庁所在地（順引き） 東京都は除外
    if(p.name!=="東京都"){
      const lvl = p.capHard ? "senior" : "junior";
      push(lvl, makeQ(`「${p.name}」の県庁所在地は？`, p.cap, pickDistractors(p.cap, ALL_CAPS, 2, sameRegionCaps)));
    }
    // 2) 県庁所在地（逆引き）東京都除外。市名≠県名は senior、それ以外は junior
    if(p.name!=="東京都"){
      const lvl = p.capHard ? "senior" : "junior";
      push(lvl, makeQ(`「${p.cap}」は何都道府県の県庁所在地？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
    }
    // 3) 地方 → junior
    push("junior", makeQ(`「${p.name}」は何地方にある？`, p.region, pickDistractors(p.region, ALL_REGIONS, 2)));
    // 4) 主な島 → elementary（沖縄は主要4島外なので除外）
    if(MAIN_ISLANDS.includes(p.island)){
      push("elementary", makeQ(`「${p.name}」は主な4つの島のうちどこにある？`, p.island, pickDistractors(p.island, MAIN_ISLANDS, 2)));
    }
    // 4b) 同じ地方の県はどれ → junior
    if(sameRegionNames.length){
      const correct = sameRegionNames[rnd(sameRegionNames.length)];
      const others = PREFS.filter(x=>x.region!==p.region).map(x=>x.name);
      push("junior", makeQ(`次のうち「${p.name}」と同じ地方にあるのはどれ？`, correct, pickDistractors(correct, others, 2)));
    }
    // 5) 旧国名（逆引き・一意のみ） → senior
    (p.old||[]).forEach(o=>{
      if(oldCount[o]===1){
        push("senior", makeQ(`旧国名(令制国)の「${o}」は、現在のどこ？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
      }
    });
    // 5b) 旧国名（順引き・一意のみ） → senior
    {
      const uOlds = (p.old||[]).filter(o=>oldCount[o]===1);
      if(uOlds.length){
        const correct = uOlds[rnd(uOlds.length)];
        push("senior", makeQ(`「${p.name}」のかつての国名(旧国名)は次のうちどれ？`, correct, pickDistractors(correct, ALL_UNIQUE_OLDS, 2, [])));
      }
    }
    // 6) 名物（逆引き・一意のみ） → elementary
    (p.spec||[]).forEach(s=>{
      if(specCount[s]===1){
        push("elementary", makeQ(`「${s}」で知られるのはどこ？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
      }
    });
    // 7) 名物（順引き） → elementary
    if((p.spec||[]).length){
      const correct = p.spec[rnd(p.spec.length)];
      const others = PREFS.filter(x=>x.name!==p.name).flatMap(x=>x.spec||[]).filter(s=>!p.spec.includes(s));
      push("elementary", makeQ(`次のうち「${p.name}」の名物はどれ？`, correct, pickDistractors(correct, others, 2)));
    }
    // 8) 名所（逆引き・一意のみ） → junior
    (p.spot||[]).forEach(s=>{
      if(spotCount[s]===1){
        push("junior", makeQ(`「${s}」があるのはどこ？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
      }
    });
    // 9) 名所（順引き） → junior
    if((p.spot||[]).length){
      const correct = p.spot[rnd(p.spot.length)];
      const others = PREFS.filter(x=>x.name!==p.name).flatMap(x=>x.spot||[]).filter(s=>!p.spot.includes(s));
      push("junior", makeQ(`次のうち「${p.name}」にある名所はどれ？`, correct, pickDistractors(correct, others, 2)));
    }
    // 10) 自然地形（逆引き・一意のみ） → senior
    if(p.nature && natCount[p.nature]===1){
      push("senior", makeQ(`「${p.nature}」があるのはどこ？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
      // 10b) 自然地形（順引き） → senior
      const others = PREFS.filter(x=>x.nature && x.name!==p.name).map(x=>x.nature);
      push("senior", makeQ(`次のうち「${p.name}」にある自然地形はどれ？`, p.nature, pickDistractors(p.nature, others, 2)));
    }
    // 11) 祭り（逆引き・一意のみ） → junior
    if(p.fest && festCount[p.fest]===1){
      push("junior", makeQ(`「${p.fest}」が行われるのはどこ？`, p.name, pickDistractors(p.name, ALL_NAMES, 2, sameRegionNames)));
    }
  });

  // 地政学・全国系プールを合流
  ["elementary","junior","senior"].forEach(lvl=>{
    (GEO_POOL[lvl]||[]).forEach(q=>buckets[lvl].push({ q:q.q, choices:q.choices.slice(), answer:q.answer }));
  });

  const META = {
    elementary:{ label:"小学生", points:10, emoji:"🌱" },
    junior:{ label:"中学生", points:15, emoji:"🌿" },
    senior:{ label:"高校生以上", points:20, emoji:"🏆" }
  };

  const QUIZ_DATA = {};
  ["elementary","junior","senior"].forEach(lvl=>{
    QUIZ_DATA[lvl] = { label:META[lvl].label, points:META[lvl].points, emoji:META[lvl].emoji, questions:buckets[lvl] };
  });

  global.QUIZ_DATA = QUIZ_DATA;
  if(typeof module!=="undefined") module.exports = { QUIZ_DATA };
})(typeof window!=="undefined" ? window : globalThis);
