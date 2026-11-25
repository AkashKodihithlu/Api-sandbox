import * as vscode from 'vscode';
import type { DiscoveryGroup } from '@mockflow/api-discovery';
import { DiscoveryReviewService } from './discovery-review.js';

export class DiscoveryTreeItem extends vscode.TreeItem {
  constructor(readonly group: DiscoveryGroup) {
    super(`${group.method} ${group.path ?? 'dynamic URL'}`);
    const duplicateCount = group.discoveries.length;
    this.description = [group.certainty, duplicateCount > 1 ? `${duplicateCount} calls` : undefined]
      .filter(Boolean)
      .join(' · ');
    this.tooltip =
      group.warnings.length > 0
        ? group.warnings.join('\n')
        : `${duplicateCount} source reference(s)`;
    this.contextValue = 'mockflow.discovery';
    this.command = {
      command: 'mockflow.reviewDiscovery',
      title: 'Review Discovery',
      arguments: [group.id],
    };
  }
}

export class DiscoveryTreeProvider implements vscode.TreeDataProvider<DiscoveryTreeItem> {
  private readonly changed = new vscode.EventEmitter<DiscoveryTreeItem | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly review: DiscoveryReviewService) {}

  refresh(): void {
    this.changed.fire(undefined);
  }
  getTreeItem(item: DiscoveryTreeItem): vscode.TreeItem {
    return item;
  }
  getChildren(): DiscoveryTreeItem[] {
    const groups = this.review.visibleGroups();
    return groups.length > 0 ? groups.map((group) => new DiscoveryTreeItem(group)) : [];
  }
}
