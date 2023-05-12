import Components from '@oss-widgets/layout/src/components/Components';
import GridLayout from '@oss-widgets/layout/src/components/GridLayout';
import { ComponentType, forwardRef, lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import widgets, { Widget } from '../widgets-manifest';
import * as layoutComponents from '../layout-components';
import EditModeSwitch from '../components/EditModeSwitch';
import { move, Rect } from '@oss-widgets/layout/src/core/types';
import { ContextMenu } from '@oss-widgets/ui/components/context-menu';
import { MenuItem } from '@oss-widgets/ui/components/menu';
import { WidgetContextProvider } from '../components/WidgetContext';
import { useNavigate } from 'react-router-dom';
import { useLayoutManager } from '../components/LayoutManager';
import useRefCallback from '@oss-widgets/ui/hooks/ref-callback';
import { useComponentBindingContext } from '@oss-widgets/ui/hooks/binding/context';
import { useBindingNames, useBindingValuePath, useImmutableBindingValuePath } from '@oss-widgets/ui/hooks/binding/hooks';

export default function Home () {
  const { duplicateItem, download } = useLayoutManager();
  const [editMode, setEditMode] = useState(process.env.NODE_ENV === 'development');
  const map = useMap<string, string>();

  const { registerRaw, unregisterRaw, update } = useComponentBindingContext('layout-items');
  const itemIds = useBindingNames('layout-items');

  const useRect = useCallback((id: string) => {
    return useBindingValuePath('layout-items', id, ['rect']);
  }, []);

  const handleDrag = useCallback((id: string, rect: Rect) => {
    const externalId = map.get(id);
    if (!externalId) {
      return;
    }
    update(externalId, item => {
      item.rect = rect;
      return item;
    });
  }, []);

  const addModule = useCallback((name: string, widget: Widget) => {
    widget.module().then(module => {
      const id = `${name}-${Math.round(Date.now() / 1000)}`;
      registerRaw(id, {
        id,
        name,
        rect: [0, 0, 8, 3],
        props: module.defaultProps ?? {},
      });
    });
  }, []);

  const duplicateWidget = useCallback((id: string) => {
    duplicateItem(id, rect => move(rect, [1, 1]));
  }, []);

  return (
    <ContextMenu
      name='bg'
      trigger={
        <div data-x-context-menu-trigger={true}> {/* TODO: ContextMenu to GridLayout not work. */}
          <GridLayout gridSize={40} gap={8} width="100vw" height="100vh" guideUi={editMode} onDrag={handleDrag}>
            <EditModeSwitch className="absolute right-1 top-1" checked={editMode} onCheckedChange={setEditMode} />
            <button className="absolute right-1 top-8" onClick={download}>Download layout.json</button>
            <Components
              itemIds={itemIds}
              draggable={editMode}
              idMap={map}
              useRect={useRect}
            >
              {memo(({ id, draggable, ...rest }) => {
                let Component: ResolvedComponentType;

                const itemPros = useBindingValuePath('layout-items', id, ['props']);
                const name = useImmutableBindingValuePath('layout-items', id, ['name']);

                const props = { ...rest, ...itemPros };

                const deleteAction = useRefCallback(() => {
                  unregisterRaw(id);
                });

                const duplicateAction = useRefCallback(() => {
                  duplicateWidget(id);
                });

                const menu = useMemo(() => {
                  return (
                    <>
                      <MenuItem
                        key="duplicate"
                        id="duplicate"
                        text="Duplicate"
                        action={duplicateAction}
                        group={0}
                        order={0}
                        disabled={false}
                      />
                      <MenuItem
                        key="delete"
                        id="delete"
                        text={<span className="text-red-400">Delete</span>}
                        action={deleteAction}
                        order={0}
                        group={1}
                        disabled={false}
                      />
                    </>
                  );
                }, []);

                if (name.startsWith('internal:')) {
                  const componentName = name.split(':')[1];
                  Component = forwardRef((layoutComponents as any)[componentName]);

                  return (
                    <ContextMenu
                      name={`widgets.${id}`}
                      trigger={<Component _id={id} {...props} />}
                    >
                      {menu}
                    </ContextMenu>
                  );
                }

                Component = cache[name];
                if (!Component) {
                  const widget = widgets[name];
                  if (!widget) {
                    throw new Error(`Unknown widget ${name}`);
                  }

                  cache[name] = Component = lazy(() => widget.module().then(module => {
                    const WidgetComponent = forwardRef(module.default);
                    const configurable = module.configurable ?? false;

                    return {
                      default: forwardRef(({ _id: id, draggable, ...props }: any, ref) => {

                        const navigate = useNavigate();

                        const configure = useCallback(() => {
                          navigate(`/edit/${encodeURIComponent(id)}`);
                        }, []);

                        const onPropChange = useRefCallback((key: string, value: any) => {
                          update(id, (props: any) => ({ ...props, [key]: value }));
                        });

                        return (
                          <WidgetContextProvider
                            value={{
                              enabled: true,
                              editingLayout: editMode,
                              configurable,
                              onPropChange,
                              props,
                              configure,
                            }}
                          >
                            <ContextMenu
                              name={`widgets.${id}`}
                              trigger={<WidgetComponent {...props} ref={ref} />}
                            >
                              {menu}
                            </ContextMenu>
                          </WidgetContextProvider>
                        );
                      }),
                    };
                  })) as any;
                }

                return (
                  <div className="widget relative bg-white" {...rest}>
                    <Suspense fallback="loading...">
                      <>
                        <Component style={{ width: '100%', height: '100%' }} {...props} _id={id} draggable={draggable} />
                      </>
                    </Suspense>
                  </div>
                );
              })}
            </Components>
          </GridLayout>
        </div>
      }
    >
      <MenuItem text="New" id="new" group={0} order={0} disabled={false}>
        {Object.entries(widgets).map(([k, v]) => {
          return {
            id: k,
            disabled: false,
            text: k,
            action: () => {
              addModule(k, v);
            },
          };
        })}
      </MenuItem>
    </ContextMenu>
  );
}

type ResolvedComponentType = ComponentType<any>;
const cache: Record<string, ResolvedComponentType> = {};

export function useMap<K, V> () {
  const [map] = useState(() => new Map<K, V>());
  return map;
}

function runAll (...func: ((id: string) => any)[]): (id: string) => void {
  return ((id) => {
    func.forEach(f => f(id));
  });
}
