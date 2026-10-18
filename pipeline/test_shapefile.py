import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
import shapefile
from pyproj import CRS
import refresh

class ShapefileTests(unittest.TestCase):
    def test_official_style_archive_without_shx_is_read_completely(self):
        with tempfile.TemporaryDirectory() as folder:
            base=Path(folder)/'wells'
            with shapefile.Writer(str(base),shapeType=shapefile.POINT) as writer:
                writer.field('LICENCE','C');writer.point(-100,51);writer.record('1')
            content=io.BytesIO()
            with zipfile.ZipFile(content,'w') as archive:
                archive.write(base.with_suffix('.shp'),'wells.shp')
                archive.write(base.with_suffix('.dbf'),'wells.dbf')
                archive.writestr('wells.prj',CRS.from_epsg(4326).to_wkt())
            source={'id':'fixture','url':'https://example.test/wells.zip','shapeSuffix':'wells.shp','requiredFields':['LICENCE']}
            with patch.object(refresh,'request',return_value=(content.getvalue(),{})):
                records,evidence=refresh.shapefile_source(source,None)
            self.assertEqual(len(records),1)
            self.assertEqual(evidence['sourceCount'],1)
            self.assertEqual(records[0]['geometry'],{'x':-100,'y':51})

if __name__=='__main__':unittest.main()
