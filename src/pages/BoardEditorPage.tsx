// src/pages/BoardEditorPage.tsx
// Dev-only board state editor. Route: /board-editor

import React, { useState } from "react"
import { RouteDomino } from "../RouteDomino"
import "../styles/skins.css"

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE = 6
const SUPABASE_TOKENS = "https://mkpyxxhbamdfzpmudqnq.supabase.co/storage/v1/object/public/skins/tokens"
const DIR_NAMES: Record<number, string> = { 1:"N", 2:"NE", 3:"E", 4:"SE", 5:"S", 6:"SW", 7:"W", 8:"NW" }

const ORDERS = [
  { id:"dragon",  primary:"#C1121F", secondary:"#D4AF37" },
  { id:"fox",     primary:"#D35400", secondary:"#F2E6D8" },
  { id:"kraken",  primary:"#0B1F3A", secondary:"#F28C28" },
  { id:"raven",   primary:"#4B2A7A", secondary:"#2B2B2B" },
  { id:"serpent", primary:"#0B0B0B", secondary:"#8C6B3F" },
  { id:"spider",  primary:"#0B0B0B", secondary:"#B11226" },
  { id:"stag",    primary:"#6B1E2D", secondary:"#1F4D2E" },
  { id:"turtle",  primary:"#556B2F", secondary:"#8C6B3F" },
  { id:"wolf",    primary:"#0B1F3A", secondary:"#C0C0C0" },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

type Side = "W" | "B"

interface BoardToken { side: Side; imageUrl?: string; cssClass: string }
interface RouteCard  { dir: number; dist: number; primary?: string; secondary?: string }

type Payload =
  | { t:"token-palette"; side:Side; imageUrl?:string; cssClass:string }
  | { t:"token-board";   key:string }
  | { t:"route-palette"; card:RouteCard }
  | { t:"route-hand";    side:Side; slot:number }
  | { t:"route-queue";   slot:number }

// ─── Module-level drag ref — avoids dataTransfer serialisation quirks ─────────
const inFlight = { current: null as Payload | null }

// ─── Tiny helpers ─────────────────────────────────────────────────────────────
const defCss = (s: Side) => s === "W" ? "skin-token-default-w" : "skin-token-default-b"

const Lbl = ({ txt }: { txt: string }) => (
  <div style={{ fontFamily:"'Cinzel',serif", fontWeight:600, fontSize:11,
    letterSpacing:"0.2em", textTransform:"uppercase", color:"#b8966a" }}>{txt}</div>
)

function Disc({ side, imageUrl, cssClass, size = 40 }:
  { side:Side; imageUrl?:string; cssClass:string; size?:number }) {
  if (imageUrl) return (
    <img src={imageUrl} draggable={false} alt=""
      style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", display:"block" }} />
  )
  return <div className={cssClass} style={{ width:size, height:size, borderRadius:"50%", position:"relative" }} />
}

// ─── Route slot — drag source + drop target ───────────────────────────────────
function RouteSlot({ card, dragPayload, onDrop, width = 52 }: {
  card: RouteCard | null; dragPayload?: Payload; onDrop: (p: Payload) => void; width?: number
}) {
  const h = Math.round(width * 13 / 7)
  const [over, setOver] = useState(false)
  return (
    <div
      draggable={!!card && !!dragPayload}
      onDragStart={card && dragPayload
        ? e => { inFlight.current = dragPayload; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text","v") }
        : undefined}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); if (inFlight.current) onDrop(inFlight.current); inFlight.current = null }}
      style={{
        width, height:h, borderRadius:8, flexShrink:0,
        border: over ? "2px dashed #5de8f7" : "1px dashed rgba(184,150,106,0.35)",
        background:"rgba(0,0,0,0.2)",
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor: card ? "grab" : "default",
      }}
    >
      {card && (
        <div style={{ pointerEvents:"none" }}>
          <RouteDomino
            dir={DIR_NAMES[card.dir] ?? "N"} dist={card.dist} size={width}
            primaryColor={card.primary} secondaryColor={card.secondary}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function BoardEditorPage() {

  const [boardStyle,  setBoardStyle] = useState<"grid"|"intersection">("grid")
  const [showDev,     setShowDev]    = useState(true)
  const [boardMap,    setBoardMap]   = useState<Map<string,BoardToken>>(new Map())
  const [wHand,       setWHand]      = useState<(RouteCard|null)[]>([null,null,null])
  const [bHand,       setBHand]      = useState<(RouteCard|null)[]>([null,null,null])
  const [queue,       setQueue]      = useState<(RouteCard|null)[]>([null,null,null])
  const [wRes,        setWRes]       = useState(9)
  const [bRes,        setBRes]       = useState(9)
  const [wCap,        setWCap]       = useState(0)
  const [bCap,        setBCap]       = useState(0)
  const [voidW,       setVoidW]      = useState(0)
  const [voidB,       setVoidB]      = useState(0)
  const [routeOrder,  setRouteOrder] = useState("default")

  const activeOrder = ORDERS.find(o => o.id === routeOrder)
  const rPri = activeOrder?.primary
  const rSec = activeOrder?.secondary

  // ── Drag helpers ──────────────────────────────────────────────────────────────
  const startDrag = (p: Payload) => (e: React.DragEvent) => {
    inFlight.current = p
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text","v")
  }
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }

  // ── Board mutations ────────────────────────────────────────────────────────────
  const place  = (key: string, t: BoardToken) => setBoardMap(m => new Map(m).set(key, t))
  const remove = (key: string)                 => setBoardMap(m => { const n = new Map(m); n.delete(key); return n })

  const doBoardDrop = (x: number, y: number) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const p = inFlight.current; inFlight.current = null; if (!p) return
    const key = `${x},${y}`
    if      (p.t === "token-board")   { if (p.key === key) return; const t = boardMap.get(p.key); if (t) { remove(p.key); place(key, t) } }
    else if (p.t === "token-palette") { place(key, { side:p.side, imageUrl:p.imageUrl, cssClass:p.cssClass }) }
  }

  const doResDrop = (side: Side) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const p = inFlight.current; inFlight.current = null
    if (!p || p.t !== "token-board") return
    const t = boardMap.get(p.key); if (!t || t.side !== side) return
    remove(p.key)
    side === "W" ? setWRes(v => v+1) : setBRes(v => v+1)
  }

  const doCapDrop = (side: Side) => (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const p = inFlight.current; inFlight.current = null
    if (!p || p.t !== "token-board") return
    const t = boardMap.get(p.key); if (!t || t.side === side) return // enemy tokens only
    remove(p.key)
    side === "W" ? setWCap(v => v+1) : setBCap(v => v+1)
  }

  const doVoidDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    const p = inFlight.current; inFlight.current = null
    if (!p || p.t !== "token-board") return
    const t = boardMap.get(p.key); if (!t) return
    remove(p.key)
    t.side === "W" ? setVoidW(v => v+1) : setVoidB(v => v+1)
  }

  // ── Route mutations ────────────────────────────────────────────────────────────
  const handFor    = (s: Side) => s === "W" ? wHand : bHand
  const setHandFor = (s: Side, v: (RouteCard|null)[]) => s === "W" ? setWHand(v) : setBHand(v)

  const consumeRoute = (p: Payload): RouteCard | null => {
    if (p.t === "route-palette") return { ...p.card }
    if (p.t === "route-hand")  { const c = handFor(p.side)[p.slot]; const n=[...handFor(p.side)]; n[p.slot]=null; setHandFor(p.side,n); return c }
    if (p.t === "route-queue") { const c = queue[p.slot]; const n=[...queue]; n[p.slot]=null; setQueue(n); return c }
    return null
  }

  const dropHand  = (side: Side, slot: number) => (p: Payload) => { const c=consumeRoute(p); if(!c) return; const n=[...handFor(side)]; n[slot]=c; setHandFor(side,n) }
  const dropQueue = (slot: number)              => (p: Payload) => { const c=consumeRoute(p); if(!c) return; const n=[...queue]; n[slot]=c; setQueue(n) }

  // ── Board ──────────────────────────────────────────────────────────────────────
  const CELL = 90, GAP = 5, PAD = 16, TOKEN = 70
  const CELL_BG = "rgba(184,150,106,0.28)" // uniform — same with or without token

  const GridBoard = () => (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${SIZE},${CELL}px)`, gridTemplateRows:`repeat(${SIZE},${CELL}px)`, gap:GAP, padding:PAD, backgroundColor:"rgba(184,150,106,0.12)", border:"1px solid rgba(184,150,106,0.30)", borderRadius:20, boxShadow:"0 8px 16px rgba(0,0,0,0.4)" }}>
      {Array.from({ length:SIZE }, (_, ry) => {
        const y = SIZE-1-ry
        return Array.from({ length:SIZE }, (_, x) => {
          const key = `${x},${y}`
          const tok = boardMap.get(key)
          return (
            <div key={key}
              draggable={!!tok}
              onDragStart={tok ? startDrag({ t:"token-board", key }) : undefined}
              onDragOver={onDragOver}
              onDrop={doBoardDrop(x, y)}
              onContextMenu={e => { e.preventDefault(); remove(key) }}
              style={{ width:CELL, height:CELL, backgroundColor:CELL_BG, borderRadius:14, boxShadow:"0 2px 4px rgba(0,0,0,0.2)", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", cursor:tok?"grab":"default" }}
            >
              <div style={{ position:"absolute", top:4, left:6, fontSize:10, fontWeight:900, color:"#6b6558", pointerEvents:"none" }}>
                {String.fromCharCode(65+x)}{y+1}
              </div>
              {tok && <div style={{ pointerEvents:"none" }}><Disc side={tok.side} imageUrl={tok.imageUrl} cssClass={tok.cssClass} size={TOKEN}/></div>}
            </div>
          )
        })
      })}
    </div>
  )

  const iC=95, iP=61, svgS=597, tR=35
  const sp=iP-0.5*iC, ep=iP+(SIZE-1+0.5)*iC

  const IntersectionBoard = () => {
    const lines: React.ReactNode[] = []
    for (let i=0;i<SIZE;i++) {
      const p=iP+i*iC
      lines.push(<line key={`h${i}`} x1={sp} y1={p} x2={ep} y2={p} stroke="rgba(184,150,106,0.30)" strokeWidth={1}/>)
      lines.push(<line key={`v${i}`} x1={p} y1={sp} x2={p} y2={ep} stroke="rgba(184,150,106,0.30)" strokeWidth={1}/>)
    }
    const dr=SIZE+1
    for (let i=-(dr-2);i<dr-1;i++) {
      let x1:number,y1:number,x2:number,y2:number
      if(i<=0){x1=sp;y1=sp-i*iC;const l=Math.min(ep-sp,ep-y1);x2=x1+l;y2=y1+l}
      else{x1=sp+i*iC;y1=sp;const l=Math.min(ep-x1,ep-sp);x2=x1+l;y2=y1+l}
      lines.push(<line key={`d1${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(184,150,106,0.30)" strokeWidth={1}/>)
    }
    for (let i=0;i<dr+(dr-2);i++) {
      let x1:number,y1:number,x2:number,y2:number
      if(i<dr){x1=sp+i*iC;y1=sp;const l=Math.min(x1-sp,ep-sp);x2=x1-l;y2=y1+l}
      else{x1=ep;y1=sp+(i-dr+1)*iC;const l=Math.min(ep-sp,ep-y1);x2=x1-l;y2=y1+l}
      lines.push(<line key={`d2${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(184,150,106,0.30)" strokeWidth={1}/>)
    }
    return (
      <div style={{ position:"relative", width:svgS, height:svgS, background:"rgba(184,150,106,0.06)", borderRadius:20, border:"1px solid rgba(184,150,106,0.30)", boxShadow:"0 8px 16px rgba(0,0,0,0.4)" }}>
        <svg width={svgS} height={svgS} style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
          {lines}
          {Array.from({length:SIZE},(_,ry)=>Array.from({length:SIZE},(_,x)=>{
            const y=SIZE-1-ry
            return <circle key={`d${x}${y}`} cx={iP+x*iC} cy={iP+ry*iC} r={5} fill={boardMap.has(`${x},${y}`)?"#5de8f7":"#ee484c"}/>
          }))}
        </svg>
        {Array.from({length:SIZE},(_,ry)=>Array.from({length:SIZE},(_,x)=>{
          const y=SIZE-1-ry; const key=`${x},${y}`; const tok=boardMap.get(key)
          const cx=iP+x*iC, cy=iP+ry*iC
          return (
            <React.Fragment key={key}>
              <div
                draggable={!!tok}
                onDragStart={tok ? startDrag({t:"token-board",key}) : undefined}
                onDragOver={onDragOver}
                onDrop={doBoardDrop(x,y)}
                onContextMenu={e=>{e.preventDefault();remove(key)}}
                style={{ position:"absolute", left:cx-iC/2, top:cy-iC/2, width:iC, height:iC, cursor:tok?"grab":"default", zIndex:2 }}
              />
              {tok && <div style={{ position:"absolute", left:cx-tR, top:cy-tR, pointerEvents:"none", zIndex:1 }}><Disc side={tok.side} imageUrl={tok.imageUrl} cssClass={tok.cssClass} size={tR*2}/></div>}
            </React.Fragment>
          )
        }))}
      </div>
    )
  }

  // ── Player panel ───────────────────────────────────────────────────────────────
  const dW = 52
  const nbs: React.CSSProperties = { width:20, height:20, borderRadius:3, background:"rgba(184,150,106,0.12)", border:"1px solid rgba(184,150,106,0.3)", color:"#d4af7a", cursor:"pointer", fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center" }

  const PlayerPanel = ({ side }: { side: Side }) => {
    const res=side==="W"?wRes:bRes, cap=side==="W"?wCap:bCap
    const hand=side==="W"?wHand:bHand
    const setRes=side==="W"?setWRes:setBRes, setCap=side==="W"?setWCap:setBCap
    const tkCss=defCss(side), capCss=defCss(side==="W"?"B":"W")
    const [overRes,setOverRes]=useState(false), [overCap,setOverCap]=useState(false)

    return (
      <div style={{ padding:12, backgroundColor:"rgba(184,150,106,0.18)", borderRadius:8, border:"1px solid rgba(184,150,106,0.30)", display:"flex", flexDirection:"column", gap:12 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:48, height:48, borderRadius:"50%", background:side==="W"?"#c8c8c8":"#26c6da", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:900, color:"#0d0d10", flexShrink:0 }}>{side}</div>
          <div>
            <div style={{ fontFamily:"'Cinzel',serif", fontWeight:700, fontSize:15, color:"#e8e4d8" }}>{side==="W"?"Wake Player":"Brake Player"}</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
              <div className={tkCss} style={{ width:12, height:12, borderRadius:"50%", position:"relative" }}/>
              <span style={{ fontSize:12, color:"#b0aa9e" }}>{side==="W"?"Wake":"Brake"}</span>
            </div>
          </div>
        </div>

        {/* Reserves + Captives */}
        <div style={{ display:"flex" }}>

          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <Lbl txt="Reserves"/>
            <div style={{ display:"flex", alignItems:"center", gap:5, margin:"4px 0" }}>
              <button onClick={()=>setRes(v=>Math.max(0,v-1))} style={nbs}>−</button>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:"#e8e4d8", minWidth:20, textAlign:"center" }}>{res}</span>
              <button onClick={()=>setRes(v=>v+1)} style={nbs}>+</button>
            </div>
            {/* Drop zone — just shows pip preview, no draggable tokens in it */}
            <div
              onDragOver={e=>{e.preventDefault();e.stopPropagation();setOverRes(true)}}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOverRes(false)}}
              onDrop={e=>{setOverRes(false);doResDrop(side)(e)}}
              style={{ width:"100%", minHeight:32, borderRadius:6, padding:"4px 6px", border:overRes?"1px dashed #5de8f7":"1px dashed rgba(184,150,106,0.2)", background:"rgba(0,0,0,0.15)", display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}
            >
              {Array.from({length:Math.min(res,16)}).map((_,i)=>(
                <div key={i} className={tkCss} style={{ width:12, height:12, borderRadius:"50%", position:"relative", pointerEvents:"none" }}/>
              ))}
              {res>16 && <span style={{ fontSize:9, color:"#6b6558", alignSelf:"center" }}>+{res-16}</span>}
            </div>
          </div>

          <div style={{ width:1, background:"linear-gradient(180deg,transparent,#b8966a,transparent)", margin:"0 8px" }}/>

          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
            <Lbl txt="Captives"/>
            <div style={{ display:"flex", alignItems:"center", gap:5, margin:"4px 0" }}>
              <button onClick={()=>setCap(v=>Math.max(0,v-1))} style={nbs}>−</button>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, color:"#e8e4d8", minWidth:20, textAlign:"center" }}>{cap}</span>
              <button onClick={()=>setCap(v=>v+1)} style={nbs}>+</button>
            </div>
            <div
              onDragOver={e=>{e.preventDefault();e.stopPropagation();setOverCap(true)}}
              onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOverCap(false)}}
              onDrop={e=>{setOverCap(false);doCapDrop(side)(e)}}
              style={{ width:"100%", minHeight:32, borderRadius:6, padding:"4px 6px", border:overCap?"1px dashed #5de8f7":"1px dashed rgba(184,150,106,0.2)", background:"rgba(0,0,0,0.15)", display:"flex", flexWrap:"wrap", gap:3, justifyContent:"center" }}
            >
              {Array.from({length:Math.min(cap,16)}).map((_,i)=>(
                <div key={i} className={capCss} style={{ width:12, height:12, borderRadius:"50%", position:"relative", pointerEvents:"none" }}/>
              ))}
              {cap>16 && <span style={{ fontSize:9, color:"#6b6558", alignSelf:"center" }}>+{cap-16}</span>}
            </div>
          </div>
        </div>

        <div style={{ height:1, background:"linear-gradient(90deg,transparent,#b8966a44,transparent)" }}/>

        {/* Route hand */}
        <div>
          <Lbl txt="Route Hand"/>
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            {hand.map((card,slot) => (
              <RouteSlot key={slot} card={card}
                dragPayload={card?{t:"route-hand",side,slot}:undefined}
                onDrop={dropHand(side,slot)} width={dW}/>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Queue ──────────────────────────────────────────────────────────────────────
  const qW = 56
  const QueueCol = () => (
    <div style={{ backgroundColor:"rgba(184,150,106,0.18)", border:"1px solid rgba(184,150,106,0.30)", padding:12, borderRadius:12, display:"flex", flexDirection:"column", gap:6, alignItems:"center", flexShrink:0, width:qW+24, boxShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>
      <Lbl txt="Queue"/>
      {queue.map((card,slot) => (
        <RouteSlot key={slot} card={card}
          dragPayload={card?{t:"route-queue",slot}:undefined}
          onDrop={dropQueue(slot)} width={qW}/>
      ))}
    </div>
  )

  // ── Void ───────────────────────────────────────────────────────────────────────
  const VoidCol = () => {
    const [over,setOver] = useState(false)
    return (
      <div
        onDragOver={e=>{e.preventDefault();e.stopPropagation();setOver(true)}}
        onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOver(false)}}
        onDrop={e=>{setOver(false);doVoidDrop(e)}}
        style={{ backgroundColor:"rgba(184,150,106,0.18)", padding:12, border:over?"2px dashed #5de8f7":"1px solid rgba(184,150,106,0.30)", borderRadius:12, display:"flex", flexDirection:"column", gap:4, alignItems:"center", boxShadow:"0 4px 6px rgba(0,0,0,0.3)", flexShrink:0, width:74, minHeight:80 }}
      >
        <Lbl txt="Void"/>
        <div style={{ display:"flex", gap:4, width:"100%", marginTop:4 }}>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {Array.from({length:Math.min(voidW,8)}).map((_,i)=>(
              <div key={i} className="skin-token-default-w" style={{ width:16, height:16, borderRadius:"50%", position:"relative" }}/>
            ))}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {Array.from({length:Math.min(voidB,8)}).map((_,i)=>(
              <div key={i} className="skin-token-default-b" style={{ width:16, height:16, borderRadius:"50%", position:"relative" }}/>
            ))}
          </div>
        </div>
        {(voidW>0||voidB>0) && (
          <div style={{ fontSize:9, color:"#6b6558", fontFamily:"'Cinzel',serif" }}>
            {voidW>0&&<div>W:{voidW}</div>}{voidB>0&&<div>B:{voidB}</div>}
          </div>
        )}
        <div style={{ fontSize:9, color:"#3a3830", marginTop:"auto", fontFamily:"'Cinzel',serif" }}>↓ drop</div>
      </div>
    )
  }

  // ── Dev palette ────────────────────────────────────────────────────────────────
  const DevPalette = () => (
    <div style={{ background:"#09090e", borderTop:"2px solid rgba(93,232,247,0.25)", padding:"14px 20px 16px", display:"flex", gap:24, alignItems:"flex-start", overflowX:"auto", flexShrink:0 }}>

      {/* Default tokens */}
      <div style={{ flexShrink:0 }}>
        <Lbl txt="Default Tokens"/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          {(["W","B"] as Side[]).map(s => (
            <div key={s} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div draggable onDragStart={startDrag({t:"token-palette",side:s,cssClass:defCss(s)})} style={{ cursor:"grab" }}>
                <div className={defCss(s)} style={{ width:44, height:44, borderRadius:"50%", position:"relative" }}/>
              </div>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:"#6b6558" }}>{s==="W"?"Wake":"Brake"}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width:1, background:"linear-gradient(180deg,transparent,rgba(184,150,106,0.3),transparent)", alignSelf:"stretch" }}/>

      {/* Order tokens */}
      <div style={{ flexShrink:0 }}>
        <Lbl txt="Order Tokens"/>
        <div style={{ display:"flex", gap:10, marginTop:8 }}>
          {ORDERS.map(o => (
            <div key={o.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:7, textTransform:"capitalize", color:"#6b6558" }}>{o.id}</span>
              <div style={{ display:"flex", gap:4 }}>
                {(["wake","brake"] as const).map(role => {
                  const imgSide: Side = role==="wake"?"W":"B"
                  const url = `${SUPABASE_TOKENS}/token-order-${o.id}-${role}.png`
                  return (
                    <div key={role} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                      <div draggable onDragStart={startDrag({t:"token-palette",side:imgSide,imageUrl:url,cssClass:defCss(imgSide)})} style={{ cursor:"grab" }}>
                        <img src={url} alt="" draggable={false}
                          style={{ width:34, height:34, borderRadius:"50%", objectFit:"cover", display:"block" }}
                          onError={e => { (e.target as HTMLImageElement).style.opacity="0.15" }}/>
                      </div>
                      <span style={{ fontFamily:"'Cinzel',serif", fontSize:7, color:"#4a4640" }}>{imgSide}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width:1, background:"linear-gradient(180deg,transparent,rgba(184,150,106,0.3),transparent)", alignSelf:"stretch" }}/>

      {/* Route cards — all 28 valid routes */}
      <div style={{ flexShrink:0 }}>
        <Lbl txt="Route Cards"/>

        {/* Colour picker */}
        <div style={{ display:"flex", gap:5, marginTop:6, marginBottom:8, alignItems:"center" }}>
          <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:"#6b6558" }}>Colour:</span>
          <button onClick={()=>setRouteOrder("default")} title="Default"
            style={{ width:18, height:18, borderRadius:"50%", background:"linear-gradient(135deg,#fff,#5de8f7)", border:routeOrder==="default"?"2px solid #5de8f7":"1px solid #444", cursor:"pointer", padding:0 }}/>
          {ORDERS.map(o => (
            <button key={o.id} title={o.id} onClick={()=>setRouteOrder(o.id)}
              style={{ width:18, height:18, borderRadius:"50%", background:o.primary, border:routeOrder===o.id?"2px solid #5de8f7":"1px solid #444", cursor:"pointer", padding:0 }}/>
          ))}
        </div>

        <div style={{ display:"flex", gap:16 }}>
          {/* Orthogonal */}
          <div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:7, color:"#4a4640", letterSpacing:"0.1em", marginBottom:6 }}>ORTHO — DIST 1–4</div>
            {[1,3,5,7].map(dir => (
              <div key={dir} style={{ display:"flex", gap:4, alignItems:"center", marginBottom:5 }}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:"#6b6558", width:24, textAlign:"right", flexShrink:0 }}>{DIR_NAMES[dir]}</span>
                {[1,2,3,4].map(dist => (
                  <div key={dist} draggable
                    onDragStart={startDrag({t:"route-palette",card:{dir,dist,primary:rPri,secondary:rSec}})}
                    style={{ cursor:"grab" }}>
                    <RouteDomino dir={DIR_NAMES[dir]} dist={dist} size={36} primaryColor={rPri} secondaryColor={rSec}/>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Diagonal */}
          <div>
            <div style={{ fontFamily:"'Cinzel',serif", fontSize:7, color:"#4a4640", letterSpacing:"0.1em", marginBottom:6 }}>DIAG — DIST 1–3</div>
            {[2,4,6,8].map(dir => (
              <div key={dir} style={{ display:"flex", gap:4, alignItems:"center", marginBottom:5 }}>
                <span style={{ fontFamily:"'Cinzel',serif", fontSize:8, color:"#6b6558", width:24, textAlign:"right", flexShrink:0 }}>{DIR_NAMES[dir]}</span>
                {[1,2,3].map(dist => (
                  <div key={dist} draggable
                    onDragStart={startDrag({t:"route-palette",card:{dir,dist,primary:rPri,secondary:rSec}})}
                    style={{ cursor:"grab" }}>
                    <RouteDomino dir={DIR_NAMES[dir]} dist={dist} size={36} primaryColor={rPri} secondaryColor={rSec}/>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ width:1, background:"linear-gradient(180deg,transparent,rgba(184,150,106,0.3),transparent)", alignSelf:"stretch" }}/>

      {/* Controls */}
      <div style={{ flexShrink:0, display:"flex", flexDirection:"column", gap:10 }}>
        <Lbl txt="Controls"/>
        <div style={{ display:"flex", gap:6, marginTop:4 }}>
          {(["grid","intersection"] as const).map(s => (
            <button key={s} onClick={()=>setBoardStyle(s)} style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:"0.12em", textTransform:"uppercase", padding:"4px 8px", borderRadius:4, cursor:"pointer", background:boardStyle===s?"rgba(184,150,106,0.2)":"transparent", border:boardStyle===s?"1px solid rgba(184,150,106,0.5)":"1px solid rgba(184,150,106,0.2)", color:boardStyle===s?"#d4af7a":"#6b6558" }}>{s}</button>
          ))}
        </div>
        <button
          onClick={()=>{ setBoardMap(new Map()); setWHand([null,null,null]); setBHand([null,null,null]); setQueue([null,null,null]); setWRes(9); setBRes(9); setWCap(0); setBCap(0); setVoidW(0); setVoidB(0) }}
          style={{ fontFamily:"'Cinzel',serif", fontSize:9, letterSpacing:"0.15em", textTransform:"uppercase", padding:"5px 10px", borderRadius:4, background:"rgba(238,72,76,0.12)", border:"1px solid rgba(238,72,76,0.3)", color:"#ee484c", cursor:"pointer" }}>
          Clear All
        </button>
        <div style={{ fontSize:10, color:"#4a4640", fontFamily:"'Cinzel',serif", lineHeight:1.8, marginTop:2 }}>
          Palette tokens → board cells<br/>
          Board tokens → reserves,<br/>
          captives, or void.<br/>
          Routes → hand / queue.<br/>
          Right-click cell = remove.
        </div>
      </div>

    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position:"fixed", inset:0, width:"100vw", height:"100vh", display:"flex", flexDirection:"column", backgroundColor:"#0a0a0c", color:"#e8e4d8", fontFamily:"'EB Garamond',Georgia,serif", overflow:"hidden" }}>
      <style>{`*{box-sizing:border-box;}body{margin:0;background:#0a0a0c;}@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=EB+Garamond:ital,wght@0,400;0,500;1,400&display=swap');`}</style>

      {/* Hide/Show Dev toggle */}
      <button onClick={()=>setShowDev(v=>!v)} style={{ position:"fixed", bottom:16, right:16, zIndex:9999, fontFamily:"'Cinzel',serif", fontWeight:700, fontSize:10, letterSpacing:"0.2em", textTransform:"uppercase", padding:"7px 16px", borderRadius:4, background:showDev?"rgba(238,72,76,0.18)":"rgba(52,211,153,0.18)", border:`1px solid ${showDev?"rgba(238,72,76,0.5)":"rgba(52,211,153,0.5)"}`, color:showDev?"#ee484c":"#34d399", cursor:"pointer" }}>
        {showDev?"Hide Dev":"Show Dev"}
      </button>

      {/* Main layout */}
      <div style={{ flex:1, display:"flex", padding:20, gap:12, overflow:"hidden", alignItems:"flex-start", justifyContent:"center" }}>

        {/* W player */}
        <div style={{ width:280, flexShrink:0, alignSelf:"stretch", overflow:"hidden" }}>
          <PlayerPanel side="W"/>
        </div>

        {/* Queue */}
        <QueueCol/>

        {/* Center */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16, flexShrink:0 }}>
          {/* Clock bar */}
          <div style={{ display:"flex", gap:20, alignItems:"center", padding:"12px 24px", backgroundColor:"rgba(184,150,106,0.18)", border:"1px solid rgba(184,150,106,0.30)", borderRadius:12, boxShadow:"0 4px 6px rgba(0,0,0,0.3)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b0aa9e" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/></svg>
            <div style={{ fontSize:24, fontWeight:900, color:"#e8e4d8", opacity:0.35 }}>W —:——</div>
            <div style={{ fontSize:24, fontWeight:900, color:"#e8e4d8", opacity:0.35 }}>B —:——</div>
            <div style={{ fontSize:18, color:"#6b6558" }}>Editor</div>
          </div>

          {/* Phase banner */}
          <div style={{ width:"100%", maxWidth:597, display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, padding:"6px 20px", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <span style={{ fontFamily:"'Cinzel',serif", fontSize:"0.52rem", letterSpacing:"0.35em", textTransform:"uppercase", color:"#3a3830" }}>EDITOR</span>
              <span style={{ color:"rgba(184,150,106,0.3)", fontSize:13 }}>—</span>
              <span style={{ fontFamily:"'Cinzel',serif", fontWeight:600, fontSize:13, color:"#6b6558" }}>Compose board state for screenshots</span>
            </div>
            <div style={{ fontSize:12, fontFamily:"monospace", color:"#3a3830", textAlign:"right", paddingRight:8 }}>
              {boardMap.size} token{boardMap.size!==1?"s":""} placed
            </div>
          </div>

          {/* Board */}
          <div className="skin-route-default">
            {boardStyle==="grid" ? <GridBoard/> : <IntersectionBoard/>}
          </div>

          <div style={{ fontFamily:"'Cinzel',serif", fontSize:11, letterSpacing:"0.15em", color:"#6b6558" }}>
            Press <span style={{ fontWeight:600, color:"#b8966a" }}>B</span> to switch board style
          </div>
        </div>

        {/* Void */}
        <VoidCol/>

        {/* B player */}
        <div style={{ width:280, flexShrink:0, alignSelf:"stretch", overflow:"hidden" }}>
          <PlayerPanel side="B"/>
        </div>
      </div>

      {showDev && <DevPalette/>}
    </div>
  )
}
