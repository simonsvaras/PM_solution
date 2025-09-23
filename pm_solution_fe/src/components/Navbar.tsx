import './Navbar.css';

export type Submodule = {
  key: string;
  name: string;
};

export type Module = {
  key: string;
  name: string;
  submodules: Submodule[];
};

export type NavbarProps = {
  modules: Module[];
  activeModuleKey: string;
  activeSubmoduleKey: string;
  onSelect: (moduleKey: string, submoduleKey?: string) => void;
};

function Navbar({ modules, activeModuleKey, activeSubmoduleKey, onSelect }: NavbarProps) {
  return (
    <aside className="navbar">
      <div className="navbar__brand" aria-label="Product Management">
        PM
      </div>
      <nav className="navbar__modules" aria-label="Hlavní navigace">
        {modules.map(module => {
          const isActiveModule = module.key === activeModuleKey;
          const fallbackSubmodule = module.submodules[0]?.key;
          return (
            <section key={module.key} className={`navbar__module ${isActiveModule ? 'is-active' : ''}`}>
              <button
                type="button"
                className="navbar__moduleButton"
                onClick={() => onSelect(module.key, fallbackSubmodule)}
              >
                {module.name}
              </button>
              <ul className="navbar__submodules">
                {module.submodules.map(submodule => {
                  const isActiveSubmodule = isActiveModule && submodule.key === activeSubmoduleKey;
                  return (
                    <li key={submodule.key}>
                      <button
                        type="button"
                        className={`navbar__submoduleButton ${isActiveSubmodule ? 'is-active' : ''}`}
                        onClick={() => onSelect(module.key, submodule.key)}
                      >
                        {submodule.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </nav>
    </aside>
  );
}

export default Navbar;
