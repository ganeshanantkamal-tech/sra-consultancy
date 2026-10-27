import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import Expertise from './components/Expertise.jsx';
import Services from './components/Services.jsx';
import Story from './components/Story.jsx';
import Process from './components/Process.jsx';
import Projects from './components/Projects.jsx';
import Stages from './components/Stages.jsx';
import Buildings from './components/Buildings.jsx';
import Problems from './components/Problems.jsx';
import Materials from './components/Materials.jsx';
import Contact from './components/Contact.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      {/* Faint column guides behind the page, like a drawing sheet */}
      <div className="column-guides" aria-hidden="true">
        <div className="wrap"><span /><span /><span /><span /><span /><span /></div>
      </div>
      <Header />
      <main id="main">
        <Hero />
        <Expertise />
        <Services />
        <Story />
        <Process />
        <Projects />
        <Stages />
        <Buildings />
        <Problems />
        <Materials />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
