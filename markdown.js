/* Local Markdown renderer. Marked 17.0.5 is bundled in vendor/. */
const markdownRenderer=new marked.Renderer();
function safeMarkdownURL(url,image=false){
 const value=String(url||'').trim();
 if(/[\u0000-\u001f\u007f]/.test(value))return '';
 if(image){
  if(/^https:\/\/[^\s]+$/i.test(value))return value;
  if(!value.startsWith('assets/'))return '';
  let decoded;try{decoded=decodeURIComponent(value);}catch{return '';}
  return decoded.split('/').every(part=>part!=='.'&&part!=='..'&&/^[\p{L}\p{M}\p{N}_.() -]+$/u.test(part))?encodeURI(decoded):'';
 }
 return /^(?:#[^\s]*|https?:\/\/[^\s]+|mailto:[^\s]+)$/i.test(value)?value:'';
}
markdownRenderer.html=({text})=>escapeHTML(text);
markdownRenderer.link=function({href,title,tokens}){const label=this.parser.parseInline(tokens),url=safeMarkdownURL(href);return url?`<a class="inline-link" href="${escapeHTML(url)}"${title?` title="${escapeHTML(title)}"`:''}${/^https?:/i.test(url)?' target="_blank" rel="noopener noreferrer"':''}>${label}</a>`:label;};
markdownRenderer.image=({href,text,title})=>{const url=safeMarkdownURL(href,true);return url?`<img src="${escapeHTML(url)}" alt="${escapeHTML(text)}"${title?` title="${escapeHTML(title)}"`:''} loading="lazy">`:escapeHTML(text);};
const markdownParser=new marked.Marked({renderer:markdownRenderer,gfm:true,breaks:true});
// Column blocks retain Markdown rendering and ignore separators inside code fences.
markdownParser.use({extensions:[{
 name:'columns',level:'block',
 start(src){return src.match(/^:::columns[ \t]+[1-4][ \t]*$/m)?.index;},
 tokenizer(src){
  const opening=/^:::columns[ \t]+([1-4])[ \t]*\r?\n/.exec(src);if(!opening)return;
  const count=Number(opening[1]),parts=[''];let offset=opening[0].length,fence=null;
  for(const line of src.slice(offset).match(/[^\n]*(?:\n|$)/g)||[]){
   if(!line)continue;const text=line.replace(/\r?\n$/,'');offset+=line.length;
   const marker=/^ {0,3}(`{3,}|~{3,})/.exec(text);
   if(fence){parts[parts.length-1]+=line;if(new RegExp('^ {0,3}'+fence.char+'{'+fence.length+',}[ \t]*$').test(text))fence=null;continue;}
   if(marker){fence={char:marker[1][0],length:marker[1].length};parts[parts.length-1]+=line;continue;}
   if(/^:::next[ \t]*$/.test(text)){parts.push('');continue;}
   if(/^:::[ \t]*$/.test(text)){
    if(parts.length!==count||parts.some(part=>!part.trim()))return;
    return {type:'columns',raw:src.slice(0,offset),count,columns:parts.map(part=>this.lexer.blockTokens(part))};
   }
   if(/^:::columns\b/.test(text))return;
   parts[parts.length-1]+=line;
  }
 },
 renderer(token){return '<div class="markdown-columns columns-'+token.count+'">'+token.columns.map(tokens=>'<div class="markdown-column">'+this.parser.parse(tokens)+'</div>').join('')+'</div>\n';}
}]});

// An explicit related-file callout remains clickable even after earlier mentions.
markdownParser.use({extensions:[{
 name:'relatedFile',level:'block',
 start(src){return src.match(/^:::file[ \t]+\S/m)?.index;},
 tokenizer(src){const match=/^:::file[ \t]+([^\r\n]+)(?:\r?\n|$)/.exec(src);if(match)return {type:'relatedFile',raw:match[0],name:match[1].trim()};},
 renderer(token){return '<div class="related-file-callout">'+relatedLink(token.name).replace('class="inline-link"','class="related-file-button"')+'</div>\n';}
}]});

function formatBody(entry){
 const template=document.createElement('template');template.innerHTML=markdownParser.parse(entry.body);
 const toc=[];
 template.content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h,i)=>{h.id='section-'+i;toc.push({id:h.id,title:h.textContent,level:Number(h.tagName.slice(1))});});
 // Keep the existing author-note syntax without interpreting raw HTML.
 template.content.querySelectorAll('p').forEach(p=>{if(p.textContent.startsWith('! ')){const note=document.createElement('aside');note.className='editor-note';note.innerHTML=p.innerHTML.replace(/^! /,'');p.replaceWith(note);}});
 const names=[...new Set([...examples.map(e=>e.title),...entry.related])].filter(n=>n!==entry.title).sort((a,b)=>b.length-a.length);
 const pattern=names.length?new RegExp(names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'):null;
 if(pattern){const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){if(node.parentElement?.closest('a,button,code,pre,h1,h2,h3,h4,h5,h6'))continue;const text=node.textContent;let start=0,html='';for(const m of text.matchAll(pattern)){html+=escapeHTML(text.slice(start,m.index))+relatedLink(m[0]);start=m.index+m[0].length;}if(start){html+=escapeHTML(text.slice(start));const fragment=document.createElement('template');fragment.innerHTML=html;node.replaceWith(fragment.content);}}}
 // Only the first mention of each destination remains interactive in the prose.
 const mentioned=new Set();
 template.content.querySelectorAll('a[href],button[data-reference]').forEach(link=>{
  if(link.classList.contains('related-file-button'))return;
  const key=link.hasAttribute('href')?'url:'+link.getAttribute('href'):'reference:'+link.dataset.reference;
  if(mentioned.has(key))link.replaceWith(...link.childNodes);else mentioned.add(key);
 });
 template.content.querySelectorAll('table').forEach(table=>{const wrap=document.createElement('div');wrap.className='markdown-table';table.replaceWith(wrap);wrap.append(table);});
 return {toc,html:template.innerHTML};
}
