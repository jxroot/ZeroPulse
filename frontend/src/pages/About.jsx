import MainLayout from '../components/Layout/MainLayout'
import AboutTab from '../components/settings/AboutTab'

const About = () => {
  return (
    <MainLayout title="About">
      <div className="card p-6">
        <AboutTab />
      </div>
    </MainLayout>
  )
}

export default About

