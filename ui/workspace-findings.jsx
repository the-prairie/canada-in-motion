import React from 'react';
import {summarizeWorkspaceFindings} from '../workspace-contract.mjs';

export function WorkspaceFindings({workspace,selection}) {
  const [primary,...rest]=summarizeWorkspaceFindings(workspace,selection);
  if(!primary)return null;
  const sourceIds=new Set([primary,...rest].flatMap(block=>block.sourceIds));
  const sources=workspace.sources.filter(source=>sourceIds.has(source.id));
  return <section className="hw-findings" aria-label="Findings for the current selection">
    <div aria-live="polite" aria-atomic="true"><p className="hw-eyebrow">Current result</p><p className="hw-finding-primary">{primary.text}</p></div>
    {(rest.length>0||sources.length>0)&&<details className="hw-finding-evidence"><summary>{rest.length?'Related findings & sources':'Sources'}</summary>
      {rest.map(block=><div key={block.panelId}><h4>{block.title}</h4><p>{block.text}</p></div>)}
      <ul>{sources.map(source=><li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul>
    </details>}
  </section>;
}
