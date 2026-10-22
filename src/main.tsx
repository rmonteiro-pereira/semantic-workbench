/** Application entry point and composition of the workspace views. */
import { Capabilities } from './auth/Capabilities';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PersonMenu } from './auth/PersonMenu';
import { AppDialogs } from './app/AppDialogs';
import { DetailsPanel } from './app/DetailsPanel';
import { SidebarResizeHandle } from './app/SidebarResizeHandle';
import { StatusFooter } from './app/StatusFooter';
import { useStableHandler } from './app/useStableHandler';
import { useWorkbench } from './app/useWorkbench';
import { WorkspaceCanvas } from './app/WorkspaceCanvas';
import { WorkspaceHeader } from './app/WorkspaceHeader';
import { WorkspaceSidebar } from './app/WorkspaceSidebar';
import { WorkspaceToolbar } from './app/WorkspaceToolbar';
import { GitBanner } from './projects/GitBanner';
import { GitSetupProvider } from './scm/GitSetup';
// Stylesheet order matters: React Flow's base styles must come after the component styles and
// before the app's own overrides, as they always have.
import '@xyflow/react/dist/style.css';
import './style.css';
function App() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  const {
    sample,
    clampSidebarWidth,
    sidebar,
    stale,
    current,
    source,
    setStale,
    saving,
    docsRef,
    setCurrent,
    setSource,
    deleteTarget,
    projects,
    setDeleteTarget,
    sourceRef,
    setDeleted,
    workspaceEvents,
    trashOpen,
    trashVersion,
    setTrashOpen,
    renaming,
    setRenaming,
    moving,
    setMoving,
    currentRef,
    importConflict,
    setImportConflict,
    projectActions,
    deleted,
    itemEditing,
    setSelected,
    setSelectedEdge,
    metrics,
    docs,
    setTab,
    setTrashVersion,
    showValidation,
    setShowValidation,
    validationState,
    sourceEditor,
    definition,
    setDefinition,
    importing,
    setImporting,
    importInto,
    importInput,
    pendingImport,
    setPendingImport,
    imports,
    tab,
    fileNavigation,
    suggestions,
    examples,
    busy,
    status,
    creationMenu,
    download,
    lineageState,
    setSearch,
    walkNavigation,
    neighborhoodFocus,
    selected,
    references,
    groupingOverview,
    grouping,
    search,
    inspector,
    selectEntity,
    selectedEdge,
    walk,
    dispatchWalk,
    entity,
  } = useWorkbench({ setMessage });
  const closeWorkspace = useStableHandler(sidebar.closeWorkspace);
  const treeAction = useStableHandler(projectActions.treeAction);
  const openDocument = useStableHandler(fileNavigation.openDocument);
  const refresh = useStableHandler(workspaceEvents.refresh);
  const loadExample = useStableHandler(examples.loadExample);
  const importIntoProject = useStableHandler(projectActions.importIntoProject);
  const importFiles = useStableHandler(imports.importFiles);
  const showNeighborhood = useStableHandler(walkNavigation.showNeighborhood);
  const exportSource = useStableHandler(download);
  const flushSave = useStableHandler(saving.autosave.flush);
  const openStale = useStableHandler(saving.openStale);
  const changeGrouping = useStableHandler(grouping.change);
  const toolbarGrouping = useMemo(
    () => ({ value: grouping.value, error: grouping.error, change: changeGrouping }),
    [grouping.value, grouping.error, changeGrouping],
  );
  const shellClassName = [
    'shell',
    sidebar.sidebarOpen ? 'workspace-open' : 'workspace-closed',
    sidebar.resizingSidebar && 'sidebar-resizing',
  ]
    .filter(Boolean)
    .join(' ');
  const canvasClassName = [
    'canvas-row',
    inspector.inspectorVisible && 'has-inspector',
    inspector.pageDetails && 'page-details',
    inspector.fullscreen.active && 'is-fullscreen',
    inspector.fullscreen.fallback && 'window-fill',
  ]
    .filter(Boolean)
    .join(' ');
  // After a clone or a change to a repository's projects, show the project's first file.
  async function openProject(slug: string) {
    const loaded = await workspaceEvents.refresh();
    const first = loaded.find(doc => doc.project === slug);
    if (first) fileNavigation.openDocument(first);
  }

  const content = (
    <GitSetupProvider onOpenProject={slug => void openProject(slug)}>
      <div
        className={shellClassName}
        style={{ '--sidebar-width': `${sidebar.sidebarWidth}px` } as React.CSSProperties}
      >
        {imports.domainDialog}
        {examples.domainDialog}
        <AppDialogs
          stale={stale}
          current={current}
          source={source}
          setStale={setStale}
          autosave={saving.autosave}
          docsRef={docsRef}
          setCurrent={setCurrent}
          setSource={setSource}
          setMessage={setMessage}
          deleteTarget={deleteTarget}
          projects={projects}
          setDeleteTarget={setDeleteTarget}
          sourceRef={sourceRef}
          setDeleted={setDeleted}
          refresh={refresh}
          trashOpen={trashOpen}
          trashVersion={trashVersion}
          setTrashOpen={setTrashOpen}
          renaming={renaming}
          setRenaming={setRenaming}
          moving={moving}
          setMoving={setMoving}
          currentRef={currentRef}
          importConflict={importConflict}
          setImportConflict={setImportConflict}
          importIntoProject={importIntoProject}
          deleted={deleted}
          undoDelete={projectActions.undoDelete}
          editing={itemEditing.editing}
          docText={itemEditing.docText}
          projectDocsOf={itemEditing.projectDocsOf}
          choicesFor={itemEditing.choicesFor}
          setEditing={itemEditing.setEditing}
          itemHints={saving.itemHints}
          applySaved={itemEditing.applySaved}
          setAdding={itemEditing.setAdding}
          setDeleting={itemEditing.setDeleting}
          openSourceAt={itemEditing.openSourceAt}
          adding={itemEditing.adding}
          documentOf={itemEditing.documentOf}
          setSelected={setSelected}
          setSelectedEdge={setSelectedEdge}
          deleting={itemEditing.deleting}
          rdfEditing={itemEditing.rdfEditing}
          setRdfEditing={itemEditing.setRdfEditing}
          setRdfDeleting={itemEditing.setRdfDeleting}
          rdfAdding={itemEditing.rdfAdding}
          setRdfAdding={itemEditing.setRdfAdding}
          rdfDeleting={itemEditing.rdfDeleting}
          wizard={itemEditing.wizard}
          kpiProject={metrics.kpiProject}
          docs={docs}
          kpis={metrics.kpis}
          setWizard={itemEditing.setWizard}
          setSelectedKpi={metrics.setSelectedKpi}
          setTab={setTab}
          committing={saving.committing}
          setCommitting={saving.setCommitting}
          setGitVersion={workspaceEvents.setGitVersion}
          setTrashVersion={setTrashVersion}
          showValidation={showValidation}
          setShowValidation={setShowValidation}
          validation={validationState.validation}
          sourceEditor={sourceEditor}
          definition={definition}
          setDefinition={setDefinition}
          importing={importing}
          setImporting={setImporting}
          importInto={importInto}
          importInput={importInput}
          pendingImport={pendingImport}
          setPendingImport={setPendingImport}
          commitImports={imports.commitImports}
        />
        <WorkspaceSidebar
          compact={sidebar.compact}
          sidebarOpen={sidebar.sidebarOpen}
          closeWorkspace={closeWorkspace}
          sidebarRef={sidebar.sidebarRef}
          tab={tab}
          setTab={setTab}
          setHistoryPath={itemEditing.setHistoryPath}
          projects={projects}
          scmSlug={itemEditing.scmSlug}
          current={current}
          treeAction={treeAction}
          docs={docs}
          openDocument={openDocument}
          setDeleteTarget={setDeleteTarget}
          setTrashOpen={setTrashOpen}
          suggestions={suggestions}
          setMessage={setMessage}
          refresh={refresh}
          examplesOpen={sidebar.examplesOpen}
          setExamplesChoice={sidebar.setExamplesChoice}
          loadExample={loadExample}
          busy={busy}
          setImporting={setImporting}
          importInput={importInput}
          importInto={importInto}
          importIntoProject={importIntoProject}
          importFiles={importFiles}
        />
        <SidebarResizeHandle
          compact={sidebar.compact}
          sidebarOpen={sidebar.sidebarOpen}
          sidebarWidth={sidebar.sidebarWidth}
          sidebarDrag={sidebar.sidebarDrag}
          setResizingSidebar={sidebar.setResizingSidebar}
          setSidebarWidth={sidebar.setSidebarWidth}
          clampSidebarWidth={clampSidebarWidth}
        />
        <main inert={sidebar.compact && sidebar.sidebarOpen}>
          <GitBanner status={status} />
          <WorkspaceHeader
            personMenu={<PersonMenu />}
            workspaceToggle={sidebar.workspaceToggle}
            compact={sidebar.compact}
            sidebarOpen={sidebar.sidebarOpen}
            setSidebarOpen={sidebar.setSidebarOpen}
            setSidebarHidden={sidebar.setSidebarHidden}
            model={validationState.model}
            current={current}
            newItems={creationMenu.newItems}
            download={exportSource}
            hasSource={!!source}
            saveStatus={saving.autosave.state.status}
            flush={flushSave}
            saveState={saving.saveState}
            error={validationState.result.error}
            setShowValidation={setShowValidation}
            openStale={openStale}
            setCommitting={saving.setCommitting}
            status={status}
          />
          <WorkspaceToolbar
            tab={tab}
            isContract={lineageState.isContract}
            setTab={setTab}
            setSearch={setSearch}
            showNeighborhood={showNeighborhood}
            neighborhoodFocus={neighborhoodFocus}
            selected={selected}
            relationship={references.relationship}
            compact={sidebar.compact}
            closeWorkspace={closeWorkspace}
            kpis={metrics.kpis}
            groupingOverview={groupingOverview}
            lineageShown={lineageState.lineageShown}
            grouping={toolbarGrouping}
            search={search}
          />
          <div ref={inspector.canvasRow} className={canvasClassName}>
            <WorkspaceCanvas
              pageDetails={inspector.pageDetails}
              tab={tab}
              isContract={lineageState.isContract}
              current={current}
              contractObject={lineageState.contractObject}
              model={validationState.model}
              docs={docs}
              setContractObject={lineageState.setContractObject}
              openInLineage={lineageState.openInLineage}
              continueInNeighborhood={lineageState.continueInNeighborhood}
              gitVersion={workspaceEvents.gitVersion}
              docText={itemEditing.docText}
              applySaved={itemEditing.applySaved}
              setMessage={setMessage}
              scmSlug={itemEditing.scmSlug}
              setGitBusy={saving.setGitBusy}
              autosave={saving.autosave}
              setCommitting={saving.setCommitting}
              projects={projects}
              source={source}
              historyPath={itemEditing.historyPath}
              setScmProject={itemEditing.setScmProject}
              setHistoryPath={itemEditing.setHistoryPath}
              refresh={refresh}
              docsRef={docsRef}
              openDocument={openDocument}
              setTab={setTab}
              kpiProject={metrics.kpiProject}
              kpis={metrics.kpis}
              kpiError={metrics.kpiError}
              kpiLoading={metrics.kpiLoading}
              selectedKpi={metrics.selectedKpi}
              setSelectedKpi={metrics.setSelectedKpi}
              kpiFilter={metrics.kpiFilter}
              setWizard={itemEditing.setWizard}
              editKpi={itemEditing.editKpi}
              editMappingItem={itemEditing.editMappingItem}
              commitImports={imports.commitImports}
              sample={sample}
              sourceEditor={sourceEditor}
              setSource={setSource}
              setEditorIssues={validationState.setEditorIssues}
              plainText={validationState.plainText}
              result={validationState.result}
              search={search}
              selectEntity={selectEntity}
              kpiBadges={metrics.kpiBadges}
              entityTarget={itemEditing.entityTarget}
              rdfTarget={itemEditing.rdfTarget}
              setEditing={itemEditing.setEditing}
              setRdfEditing={itemEditing.setRdfEditing}
              mappingId={lineageState.mappingId}
              mappingView={lineageState.mappingView}
              fullscreen={inspector.fullscreen}
              graphViewSwitch={lineageState.graphViewSwitch}
              lineage={lineageState.lineage}
              lineageCenterId={lineageState.lineageCenterId}
              lineageCenterChanged={lineageState.lineageCenterChanged}
              groupingOverview={groupingOverview}
              grouping={grouping}
              selected={selected}
              selectedEdge={selectedEdge}
              setSelectedEdge={setSelectedEdge}
              setSelected={setSelected}
              setSearch={setSearch}
              showNeighborhood={showNeighborhood}
              walk={walk}
              dispatchWalk={dispatchWalk}
              walkTo={walkNavigation.walkTo}
              setKpiFilter={metrics.setKpiFilter}
              crossFile={references.crossFile}
              crossTo={walkNavigation.crossTo}
            />
            <DetailsPanel
              inspectorVisible={inspector.inspectorVisible}
              pageDetails={inspector.pageDetails}
              entity={entity}
              relationship={references.relationship}
              setSelected={setSelected}
              setSelectedEdge={setSelectedEdge}
              activeGroup={references.activeGroup}
              selectedEdge={selectedEdge}
              relationshipTarget={itemEditing.relationshipTarget}
              rdfEdgeTarget={itemEditing.rdfEdgeTarget}
              setRdfEditing={itemEditing.setRdfEditing}
              source={source}
              setEditing={itemEditing.setEditing}
              setDeleting={itemEditing.setDeleting}
              model={validationState.model}
              setSource={setSource}
              current={current}
              setDefinition={setDefinition}
              showNeighborhood={showNeighborhood}
              rdfTarget={itemEditing.rdfTarget}
              setRdfDeleting={itemEditing.setRdfDeleting}
              entityTarget={itemEditing.entityTarget}
              setAdding={itemEditing.setAdding}
              relatedDocuments={references.relatedDocuments}
              openDocument={openDocument}
            />
          </div>
          <StatusFooter
            error={validationState.result.error}
            hasSource={!!source}
            hasDocument={!!current}
            dirty={!!current && source !== current.source}
            setShowValidation={setShowValidation}
            issueCount={validationState.validation.issues.length}
            entityCount={validationState.model?.entities.length ?? 0}
            relationshipCount={validationState.model?.edges.length ?? 0}
            message={message}
            tab={tab}
          />
        </main>
      </div>
    </GitSetupProvider>
  );
  return <Capabilities projects={projects}>{content}</Capabilities>;
}
createRoot(document.getElementById('root')!).render(<App />);
