import { scanWorkspace, type DiscoveryGroup, type ScanOptions } from '@mockflow/api-discovery';

export type WorkspaceScanner = (workspaceRoot: string, options?: ScanOptions) => Promise<DiscoveryGroup[]>;

export class DiscoveryReviewService {
  private groups: DiscoveryGroup[] = [];
  private readonly ignored = new Set<string>();

  constructor(private readonly scanner: WorkspaceScanner = scanWorkspace) {}

  async scan(workspaceRoot: string, options?: ScanOptions): Promise<void> {
    this.groups = await this.scanner(workspaceRoot, options);
    this.ignored.clear();
  }

  visibleGroups(): DiscoveryGroup[] {
    return this.groups.filter((group) => !this.ignored.has(group.id));
  }

  ignore(groupId: string): void {
    this.ignored.add(groupId);
  }

  find(groupId: string): DiscoveryGroup | undefined {
    return this.groups.find((group) => group.id === groupId);
  }
}
