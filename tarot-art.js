const motifs={
 wanderer:'<path d="M48 140Q70 95 64 54Q108 70 94 115Q77 125 62 134M63 132L88 79"/><circle cx="105" cy="50" r="14"/><path d="M105 30V24M125 50H131M91 36L86 31"/>',
 tools:'<path d="M42 109H118M51 109V143M109 109V143M80 43V91M62 58Q80 31 98 58M54 70L46 78M106 70L114 78"/><circle cx="80" cy="36" r="5"/><circle cx="58" cy="97" r="7"/><path d="M77 90L85 103L69 103Z"/>',
 veil:'<path d="M37 145V50H50V145M110 145V50H123V145M51 61Q80 45 109 61M51 75Q80 59 109 75M51 89Q80 73 109 89"/><path d="M91 113A21 21 0 1 1 73 82A25 25 0 0 0 91 113Z"/>',
 bloom:'<path d="M80 149V100M80 130Q46 136 43 111Q68 106 80 130M80 118Q114 124 117 99Q92 94 80 118"/><circle cx="80" cy="77" r="15"/><path d="M80 56Q63 33 57 59Q32 57 46 78Q33 100 59 97Q65 121 80 99Q96 121 102 97Q127 101 114 78Q127 56 103 59Q97 34 80 56Z"/>',
 mountain:'<path d="M26 143L59 68L80 101L104 49L138 143ZM51 143V131H109V143M59 131V119H101V131M67 119V108H93V119M94 70L103 77L111 66"/><circle cx="51" cy="44" r="9"/>',
 keys:'<circle cx="60" cy="70" r="17"/><circle cx="99" cy="70" r="17"/><path d="M48 82L111 145M111 145L119 137M99 133L107 125M111 83L48 146M48 146L40 138M60 134L52 126M80 36V48M74 42H86"/>',
 union:'<path d="M80 128C17 92 33 41 65 61L80 75L95 61C127 41 143 92 80 128Z"/><circle cx="80" cy="91" r="36"/><path d="M80 140V155M73 148H87"/>',
 path:'<path d="M44 145L80 61L116 145M62 145L80 101L98 145M31 145H129M80 62V34M67 46L80 33L93 46"/><circle cx="44" cy="115" r="9"/><circle cx="116" cy="115" r="9"/>',
 lion:'<circle cx="80" cy="91" r="30"/><path d="M80 47L93 58L110 55L116 72L130 81L123 97L127 115L109 121L100 138L82 132L65 138L56 121L38 117L41 99L32 84L46 72L49 55L67 58ZM65 85H70M92 85H97M71 104Q80 114 89 104M75 95L80 101L85 95"/><path d="M58 31Q69 18 80 31Q91 44 102 31Q91 18 80 31Q69 44 58 31"/>',
 lantern:'<path d="M53 74H107V132H53ZM48 74L80 50L112 74M70 50V38H90V50M63 82V124M97 82V124M80 88L87 102L80 116L73 102ZM45 142H115"/><circle cx="80" cy="104" r="42"/>',
 wheel:'<circle cx="80" cy="93" r="47"/><circle cx="80" cy="93" r="36"/><circle cx="80" cy="93" r="10"/><path d="M80 47V83M80 103V139M34 93H70M90 93H126M48 61L73 86M87 100L112 125M48 125L73 100M87 86L112 61"/>',
 scales:'<path d="M80 39V144M47 144H113M40 66H120M46 66L28 107H64ZM114 66L96 107H132ZM73 42L80 30L87 42"/><circle cx="80" cy="67" r="5"/>',
 suspension:'<path d="M36 47H125M47 47V143M79 47L79 88L103 112L86 130M79 88L61 108M75 102L92 92"/><circle cx="73" cy="131" r="11"/><circle cx="73" cy="131" r="18"/>',
 threshold:'<path d="M44 146V80A36 36 0 0 1 116 80V146M55 146V81A25 25 0 0 1 105 81V146M28 146H132M80 146V132"/><path d="M64 116A18 18 0 0 1 100 116ZM65 109L61 105M82 95V89M100 109L105 105"/>',
 vessels:'<path d="M34 65H70L63 92H41ZM47 92V109M36 111H69M91 110H127L120 137H98ZM104 137V149M94 149H126M60 67Q112 45 109 109M51 113Q80 131 102 113"/><circle cx="80" cy="43" r="10"/>',
 chain:'<path d="M49 109L64 94Q77 81 86 92Q96 102 83 115L67 132Q54 145 44 134Q34 123 49 109ZM78 77L94 62Q107 49 117 60Q127 71 114 84L98 100Q85 113 75 102Q65 91 78 77M65 115L98 82"/><path d="M54 49L44 34M47 60H29M67 43L64 27"/>',
 tower:'<path d="M49 147L57 78H103L111 147ZM55 78L48 64L65 69L79 56L92 68L110 62L104 78M70 147V124H91V147M69 91V105M91 91V105M78 28L67 49H84L74 70M31 104L22 111M128 113L137 120"/>',
 star:'<path d="M80 35L89 74L127 84L89 94L80 133L70 94L32 84L70 74ZM42 45L45 55L56 58L45 61L42 71L39 61L29 58L39 55ZM120 126L123 136L134 139L123 142L120 152L117 142L107 139L117 136"/><path d="M37 143Q60 135 83 143M48 154Q71 146 94 154"/>',
 moon:'<path d="M100 119A43 43 0 1 1 65 40A48 48 0 0 0 100 119Z"/><circle cx="110" cy="47" r="4"/><path d="M27 143Q53 131 79 143T131 143M38 154Q64 142 90 154"/>',
 sun:'<circle cx="80" cy="92" r="28"/><circle cx="80" cy="92" r="21"/><path d="M80 52V32M80 132V152M40 92H20M120 92H140M52 64L38 50M108 120L122 134M52 120L38 134M108 64L122 50M65 55L60 42M95 129L100 142M43 107L30 112M117 77L130 72M95 55L100 42M65 129L60 142M43 77L30 72M117 107L130 112"/>',
 calling:'<path d="M38 87L102 52L111 67L57 110ZM102 52L110 41L130 76L111 67M57 110L68 136L80 130L69 102M45 94L34 101M125 39L132 28M139 56H150"/><path d="M30 151Q80 135 130 151"/>',
 wreath:'<ellipse cx="80" cy="93" rx="38" ry="55"/><ellipse cx="80" cy="93" rx="28" ry="44"/><path d="M47 69L32 61L38 78M42 92L25 88L36 104M47 118L32 123L47 132M113 69L128 61L122 78M118 92L135 88L124 104M113 118L128 123L113 132M73 43L80 33L87 43M73 146L80 156L87 146"/>'
};
const suits={
 wands:'<path d="M0 -16V16M0 -8Q-14 -17 -10 -3Q-6 1 0 0M0 4Q14 -5 10 9Q6 13 0 12"/>',
 cups:'<path d="M-12 -13H12L8 2Q0 9 -8 2ZM0 7V15M-9 16H9"/>',
 swords:'<path d="M0 -20L5 -9L0 8L-5 -9ZM-10 9H10M0 9V20M-5 20H5"/>',
 pentacles:'<circle r="16"/><path d="M0 -12L7 10L-11 -4H11L-7 10Z"/>'
};
export function cardArtwork(card,reversed=false){
 const uid='art-'+card.id;
 let art;
 if(card.arcana==='major')art=motifs[card.art]||motifs.star;
 else{
  const count=card.number<=10?card.number:1;
  const points=count===1?[[80,92,1.9]]:Array.from({length:count},(_,index)=>{const cols=count<=3?1:2,rows=Math.ceil(count/cols);return [cols===1?80:57+(index%2)*46,53+Math.floor(index/cols)*(86/Math.max(1,rows-1)),.7];});
  art=points.map(([x,y,scale])=>'<g transform="translate('+x+' '+y+') scale('+scale+')">'+suits[card.suit]+'</g>').join('');
  if(card.number>10)art+='<path d="M45 145H115L107 125L94 135L80 119L66 135L53 125Z"/>';
 }
 return '<svg viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="'+uid+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0c4a1"/><stop offset=".4" stop-color="#b67a53"/><stop offset=".65" stop-color="#efd0ad"/><stop offset="1" stop-color="#805136"/></linearGradient><radialGradient id="'+uid+'-bg"><stop stop-color="#412b38"/><stop offset="1" stop-color="#19111c"/></radialGradient></defs><rect x="1" y="1" width="158" height="218" rx="12" fill="url(#'+uid+'-bg)" stroke="#b9845b"/><rect x="8" y="8" width="144" height="204" rx="8" fill="none" stroke="#c18b6045"/><g transform="'+(reversed?'translate(160 220) rotate(180)':'')+'"><circle cx="80" cy="92" r="62" stroke="#c18b601c" fill="none"/><g stroke="url(#'+uid+')" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round">'+art+'</g><text x="80" y="23" text-anchor="middle" fill="#d8ac88" font-family="Georgia,serif" font-size="9">'+(card.arcana==='major'?String(card.number).padStart(2,'0'):card.number<=10?card.number:['PAGE','KNIGHT','QUEEN','KING'][card.number-11])+'</text><path d="M42 173H118" stroke="#c18b6044"/><text x="80" y="190" text-anchor="middle" fill="#ecd2ba" font-family="Georgia,serif" font-size="10">'+card.name+'</text><path d="M80 198L83 203L80 208L77 203Z" fill="#c18b60"/></g></svg>';
}
export const cardBack='<svg viewBox="0 0 160 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="card-back-bg"><stop stop-color="#3a2632"/><stop offset="1" stop-color="#130f17"/></radialGradient></defs><rect x="1" y="1" width="158" height="218" rx="12" fill="url(#card-back-bg)" stroke="#b9845b"/><rect x="8" y="8" width="144" height="204" rx="8" fill="none" stroke="#c18b6055"/><path d="M18 43L80 15L142 43V177L80 205L18 177Z" fill="none" stroke="#c18b6025"/><ellipse cx="80" cy="110" rx="52" ry="69" fill="none" stroke="#c18b6045"/><ellipse cx="80" cy="110" rx="44" ry="61" fill="none" stroke="#c18b6020"/><image href="logos/ember-copper-compact.svg" x="57" y="70" width="46" height="78"/><circle cx="80" cy="43" r="7" fill="#c18b60"/><circle cx="80" cy="177" r="7" fill="none" stroke="#c18b60"/><path d="M28 110H38M33 105V115M122 110H132M127 105V115M80 21V29M80 191V199" stroke="#c18b60"/></svg>';
